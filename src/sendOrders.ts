import * as dotenv from 'dotenv'
import axios, { AxiosResponse, AxiosError } from 'axios'
import { Array, Number, Record, String, Static, Literal } from 'runtypes'

dotenv.config()
const axiosAirtable = axios.create({
  baseURL: 'https://api.airtable.com/v0/apppCzTfDnvgah1Z3/',
  headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY || ''}` }
})

const DODO_OAUTH_URI = 'https://login.microsoftonline.com/1b9b966e-0ce7-44ed-a2df-83446c830a18/oauth2/v2.0/token'
const DODO_ORDERS_API = 'http://api-staging.gaia.delivery/integrations/v2/zachran-jidlo/orders'
const AIRTABLES = {
  DONORS: 'Dárci',
  CHARITIES: 'Příjemci',
  ORDERS: 'Rozvozy'
}

const DodoTokenRT = Record({
  token_type: Literal('Bearer'),
  expires_in: Number,
  ext_expires_in: Number,
  access_token: String
})
type DodoToken = Static<typeof DodoTokenRT>;

const DonorRT = Record({
  id: String,
  fields: Record({
    ID: String, // "Zachraň jídlo"
    'Telefonní číslo': String, // +420123999888
    'Vyzvednout od': Number, // 50400
    'Vyzvednout do': Number, // 30000
    'Doručit od': Number, // 50800
    'Doručit do': Number, // 60800
    'Odpovědná osoba': String, // Anna Strejcová
    Příjemce: Array(String) // ["rec8116cdd76088af"]
  })
})
type Donor = Static<typeof DonorRT>;

const CharityRT = Record({
  id: String,
  fields: Record({
    ID: String, // "Charita 1"
    'Telefonní číslo': String, // +420123999888
    'Odpovědná osoba': String, // Anna Strejcová
    Adresa: String // Spojená 22, Praha 3, 130000
  })
})
type Charity = Static<typeof CharityRT>;

type Order = {
  id: string,
  donor: Donor,
  charity: Charity,
  pickupFrom: Date,
  pickupTo: Date,
  deliverFrom: Date,
  deliverTo: Date
}

const getDonors = async (): Promise<unknown> => {
  const { data } = await axiosAirtable.get(
    encodeURIComponent(AIRTABLES.DONORS),
    {
      params: {
        maxRecords: 5000,
        view: 'Grid view'
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
        maxRecords: 5000,
        view: 'Grid view'
      }
    }
  )
  return data
}

const addOrderToAirtable = async (order: Order): Promise<AxiosResponse<unknown>> => {
  return await axiosAirtable.post(
    encodeURIComponent(AIRTABLES.ORDERS),
    {
      records: [
        {
          fields: {
            Identifikátor: order.id,
            Dárce: [
              order.donor.id
            ],
            Příjemce: [
              order.charity.id
            ],
            'Vyzvednout od': order.pickupFrom.toISOString(),
            'Vyzvednout do': order.pickupTo.toISOString(),
            'Doručit od': order.deliverFrom.toISOString(),
            'Doručit do': order.deliverTo.toISOString()
          }
        }
      ]
    }
  )
}

const getDodoToken = async (): Promise<unknown> => {
  const params = new URLSearchParams()
  params.append('grant_type', 'client_credentials')
  params.append('scope', '6add48c5-cf9d-4e7b-88dd-a59a6c57c22e/.default')
  params.append('client_id', process.env.DODO_CLIENT_ID || '')
  params.append('client_secret', process.env.DODO_CLIENT_SECRET || '')

  const { data } = await axios.post(
    DODO_OAUTH_URI,
    params
  )
  return data
}

const createOrder = async (order: Order, token: DodoToken): Promise<AxiosResponse<unknown>> => {
  return await axios.post(
    DODO_ORDERS_API,
    {
      Identifier: order.id,
      Pickup: {
        BranchIdentifier: order.donor.fields.ID,
        RequiredStart: order.pickupFrom.toISOString(),
        RequiredEnd: order.pickupTo.toISOString()
      },
      Drop: {
        AddressRawValue: order.charity.fields.Adresa, // Valid Order address
        RequiredStart: order.deliverFrom.toISOString(),
        RequiredEnd: order.deliverTo.toISOString()
      },
      CustomerName: order.charity.fields['Odpovědná osoba'],
      CustomerPhone: order.charity.fields['Telefonní číslo'],
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
  date.setMilliseconds(0)
  date.setSeconds(0)
  date.setMinutes(0)
  date.setHours(0)

  date.setSeconds(addSeconds)

  return date
}

export const sendOrders = async () => {
  console.info(`Loading donors from "${AIRTABLES.DONORS}" table`)
  const donorsResponse = await getDonors()
  const { records: donorsData } = Record({ records: Array(Record({ id: String })) }).check(donorsResponse)
  console.info(`Found ${donorsData.length} donor(s) in "${AIRTABLES.DONORS}" table`)

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

  let handledOrdersCount = 0
  for (const donorData of donorsData) {
    try {
      console.info(`Handling donor ${JSON.stringify(donorData)}`)
      const donor = DonorRT.check(donorData)
      for (const charityId of donor.fields.Příjemce) {
        const charity = CharityRT.check(charitiesMap.get(charityId))

        const order: Order = {
          id: `${donor.fields.ID}-${charity.fields.ID}-${getDateAfter7days().toLocaleDateString('cs')}`.toLowerCase().replace(/ /g, ''),
          donor,
          charity,
          pickupTo: getDateAfter7days(donor.fields['Vyzvednout do']),
          pickupFrom: getDateAfter7days(donor.fields['Vyzvednout od']),
          deliverTo: getDateAfter7days(donor.fields['Doručit do']),
          deliverFrom: getDateAfter7days(donor.fields['Doručit od'])

        }

        console.info(`-> Creating order ${order.id} on DODO`)
        await createOrder(order, dodoToken)

        console.info(`-> Adding order ${order.id} to ${AIRTABLES.ORDERS} table`)
        await addOrderToAirtable(order)
        handledOrdersCount++
      }
    } catch (error) {
      console.error('Handling donor failed', error instanceof AxiosError ? error?.response?.data || error?.message : error)
    }
  }

  if (!handledOrdersCount) throw new Error('No orders have been handled')
  console.info(`Script finished, ${handledOrdersCount} order(s) have been handled`)
}
