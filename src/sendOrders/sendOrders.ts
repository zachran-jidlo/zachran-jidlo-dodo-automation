import axios, { AxiosResponse, AxiosError } from 'axios'
import { Array, Record, String, Optional } from 'runtypes'
import { axiosAirtable, AIRTABLES, DodoToken, DodoTokenRT, getDodoToken, DODOOrder, DonorRT, CharityRT } from './../common'

const getDonors = async (): Promise<unknown> => {
  const { data } = await axiosAirtable.get(
    encodeURIComponent(AIRTABLES.DONORS),
    {
      params: {
        view: 'Grid view',
        filterByFormula: '{Osobní odběr}=FALSE()'
      }
    }
  )
  return data
}

const getCharities = async (): Promise<unknown> => {
  const { data } = await axiosAirtable.get(
    encodeURIComponent(AIRTABLES.CHARITIES),
    {
      params: {
        view: 'Grid view'
      }
    }
  )
  return data
}

const addOrderToAirtable = async (order: DODOOrder): Promise<AxiosResponse<unknown>> => {
  return await axiosAirtable.post(
    encodeURIComponent(AIRTABLES.ORDERS),
    {
      records: [
        {
          fields: {
            Identifikátor: order.id,
            Dárce: [
              order.pickupAirtableId
            ],
            Příjemce: [
              order.deliverAirtableId
            ],
            'Vyzvednout od': order.pickupFrom.toISOString(),
            'Vyzvednout do': order.pickupTo.toISOString(),
            'Doručit od': order.deliverFrom.toISOString(),
            'Doručit do': order.deliverTo.toISOString(),
            Status: 'čeká'
          }
        }
      ]
    }
  )
}

const createOrder = async (order: DODOOrder, token: DodoToken): Promise<AxiosResponse<unknown>> => {
  return await axios.post(
    process.env.DODO_ORDERS_API || '',
    {
      Identifier: order.id,
      Pickup: {
        BranchIdentifier: order.pickupDodoId,
        RequiredStart: order.pickupFrom.toISOString(),
        RequiredEnd: order.pickupTo.toISOString(),
        Note: order.pickupNote
      },
      Drop: {
        AddressRawValue: order.deliverAddress, // Valid Order address
        RequiredStart: order.deliverFrom.toISOString(),
        RequiredEnd: order.deliverTo.toISOString(),
        Note: order.deliverNote
      },
      CustomerName: order.customerName,
      CustomerPhone: order.customerPhone,
      Price: 0
    },
    {
      headers: { Authorization: `Bearer ${token.access_token || ''}` },
      timeout: 30000
    }
  )
}

const getDateAfter7days = (addSeconds = 0): Date => {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCMinutes(date.getTimezoneOffset())
  date.setUTCSeconds(addSeconds)

  return date
}

const handleOrders = async (donorsData: {id: string}[], charitiesMap: Map<string, unknown>, dodoToken: DodoToken): Promise<number> => {
  let handledOrdersCount = 0
  for (const donorData of donorsData) {
    try {
      console.info(`Handling donor ${JSON.stringify(donorData)}`)
      const donor = DonorRT.check(donorData)
      for (const charityId of donor.fields.Příjemce) {
        const charity = CharityRT.check(charitiesMap.get(charityId))

        const order: DODOOrder = {
          id: `${donor.fields.ID}-${charity.fields.Název}-${getDateAfter7days().toLocaleDateString('cs')}`.toLowerCase().replace(/ /g, ''),
          pickupDodoId: donor.fields.ID,
          pickupAirtableId: donor.id,
          pickupTo: getDateAfter7days(donor.fields['Vyzvednout do']),
          pickupFrom: getDateAfter7days(donor.fields['Vyzvednout od']),
          pickupNote: donor.fields['Poznámka'] || '',
          deliverAddress: `${charity.fields.Adresa}${charity.fields.Oblast ? ' ' + charity.fields.Oblast : ''}`,
          deliverAirtableId: charity.id,
          deliverTo: getDateAfter7days(donor.fields['Doručit do']),
          deliverFrom: getDateAfter7days(donor.fields['Doručit od']),
          deliverNote: charity.fields['Poznámka'] || '',
          customerName: charity.fields['Odpovědná osoba'],
          customerPhone: charity.fields['Telefonní číslo']
        }

        console.info(`-> Creating order ${JSON.stringify(order)} on DODO`)
        await createOrder(order, dodoToken)

        console.info(`-> Adding order ${order.id} to ${AIRTABLES.ORDERS} table`)
        await addOrderToAirtable(order)
        handledOrdersCount++
      }
    } catch (error) {
      console.error('Handling donor failed', error instanceof AxiosError ? error?.response?.data || error?.message : error)
    }
  }

  return handledOrdersCount
}

export const sendOrders = async () => {
  try {
    console.info(`Loading donors from "${AIRTABLES.DONORS}" table`)
    const donorsResponse = await getDonors()
    const { records: donorsData, offset } = Record({ records: Array(Record({ id: String })), offset: Optional(String) }).check(donorsResponse)
    console.info(`Found ${donorsData.length} donor(s) in "${AIRTABLES.DONORS}" table`)
    if (offset) console.warn(`More donors found with offset ${offset}, you should implement pagination`)

    console.info(`Loading charities from "${AIRTABLES.CHARITIES}" table`)
    const charitiesResponse = await getCharities()
    const { records: charitiesData } = Record({ records: Array(Record({ id: String })) }).check(charitiesResponse)
    console.info(`Found ${charitiesData.length} charit(y)ies in "${AIRTABLES.CHARITIES}" table`)
    const charitiesMap = new Map()
    charitiesData.forEach(charityData => { charitiesMap.set(charityData.id, charityData) })

    console.info('Getting temporary DODO oauth token')
    const dodoTokenResponse = await getDodoToken()
    const dodoToken = DodoTokenRT.check(dodoTokenResponse)
    console.info(`Successfully received temporary DODO oauth token (expires in ${dodoToken.expires_in}s)`)

    const handledOrdersCount = await handleOrders(donorsData, charitiesMap, dodoToken)
    if (!handledOrdersCount) throw new Error('No orders have been handled')

    console.info(`Script finished, ${handledOrdersCount} order(s) have been handled`)
  } catch (error) {
    console.error('Script failed', error instanceof AxiosError ? error?.response?.data || error?.message : error)
    process.exit(1)
  }
}
