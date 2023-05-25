import axios, { AxiosError, AxiosResponse } from 'axios'
import { Array as ArrayRT, Record, String, Optional, Literal, Boolean, Static } from 'runtypes'
import { axiosAirtable, AIRTABLES, DodoToken, getDodoToken, DodoTokenRT, DODOOrder, DonorRT, CharityRT, createOrder, addOrderToAirtable } from './../common'

const ORDER_MUST_BE_CONFIRMED_MINUTES_BEFORE_PICKUP = 35

const OrderRT = Record({
  id: String,
  fields: Record({
    Identifikátor: String, // "test-restaurace-1-charita13-6.10.2022"
    Dárce: ArrayRT(String), // ["rec8116cdd76088af"]
    Příjemce: ArrayRT(String), // ["rec8116cdd76088af"]
    'Vyzvednout od': String, // "2022-10-06T12:30:00.000Z"
    Status: Literal('čeká')
  })
})
type Order = Static<typeof OrderRT>;

const ConfirmationRT = Record({
  id: String,
  fields: Record({
    'Svoz krabiček': Optional(Boolean)
  })
})

const getOrders = async (): Promise<unknown> => {
  const { data } = await axiosAirtable.get(
    encodeURIComponent(AIRTABLES.ORDERS),
    {
      params: {
        filterByFormula: 'AND(IS_SAME({Vyzvednout od},TODAY(),"day"),{Status}="čeká")',
        view: 'Grid view'
      }
    }
  )
  return data
}

const getDonor = async (donorId: string): Promise<unknown> => {
  const { data } = await axiosAirtable.get(
    encodeURIComponent(AIRTABLES.DONORS),
    {
      params: {
        view: 'Grid view',
        filterByFormula: `RECORD_ID()="${donorId}"`
      }
    }
  )
  return data.records[0]
}

const getCharity = async (charityId: string): Promise<unknown> => {
  const { data } = await axiosAirtable.get(
    encodeURIComponent(AIRTABLES.CHARITIES),
    {
      params: {
        view: 'Grid view',
        filterByFormula: `RECORD_ID()="${charityId}"`
      }
    }
  )
  return data.records[0]
}

const getConfirmation = async (donorId: string): Promise<unknown> => {
  const { data } = await axiosAirtable.get(
    encodeURIComponent(AIRTABLES.OFFERS),
    {
      params: {
        filterByFormula: `AND({DárceID}="${donorId}",IS_SAME({Přidáno dne},TODAY(),"day"))`,
        view: 'Grid view'
      }
    }
  )
  return data
}

const updateOrderStatus = async (orderId: string, confirmed = true): Promise<unknown> => {
  const { data } = await axiosAirtable.patch(
    encodeURIComponent(AIRTABLES.ORDERS),
    {
      records: [
        {
          id: orderId,
          fields: {
            Status: confirmed ? 'potvrzeno' : 'storno'
          }
        }
      ]
    }
  )
  return data
}

const cancelDodoOrder = async (orderIdentification: string, token: DodoToken): Promise<AxiosResponse<unknown>> => {
  return await axios.put(
    `${process.env.DODO_ORDERS_API}/${encodeURIComponent(orderIdentification)}/status`,
    {
      Status: 'Cancelled',
      Reason: 'Delivery was not confirmed in time',
      StatusChangeTime: new Date().toISOString()
    },
    {
      headers: { Authorization: `Bearer ${token.access_token || ''}` },
      timeout: 30000
    }
  )
}

const getTomorrowDate = (hours: number, minutes: number): Date => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(hours)
  tomorrow.setMinutes(minutes);
  tomorrow.setSeconds(0);
  tomorrow.setMilliseconds(0);

  return tomorrow;
}

const createOrderForPackages = async (order: Order) => {
  try {
    const donorData = await getDonor(order.fields.Dárce[0])
    const donor = DonorRT.check(donorData)

    const charityData = await getCharity(order.fields.Příjemce[0])
    const charity = CharityRT.check(charityData)

    const newOrder: DODOOrder = {
      id: `${charity.fields.ID}-${donor.fields.ID}-${getTomorrowDate(8,0).toLocaleDateString('cs')}`.toLowerCase().replace(/ /g, ''),
      pickupDodoId: charity.fields.ID,
      pickupAirtableId: charity.id,
      pickupFrom: getTomorrowDate(8,0),
      pickupTo: getTomorrowDate(8,30),
      pickupNote: 'Vyzvednutí REkrabiček',
      deliverAddress: `${donor.fields.Adresa}${donor.fields.Oblast ? ' ' + donor.fields.Oblast : ''}`,
      deliverAirtableId: donor.id,
      deliverFrom: getTomorrowDate(9,0),
      deliverTo: getTomorrowDate(9,30),
      deliverNote: 'Doručení REkrabiček',
      customerName: donor.fields['Odpovědná osoba'],
      customerPhone: donor.fields['Telefonní číslo']
    }

    const dodoTokenResponse = await getDodoToken()
    const dodoToken = DodoTokenRT.check(dodoTokenResponse)

    await createOrder(newOrder, dodoToken)

    await addOrderToAirtable(newOrder, 'krabičky')
  } catch(error) {
    console.error('Failed creating packages order', error instanceof AxiosError ? error?.response?.data || error?.message : error)
  }

  return null
}

const handleOrders = async (ordersData: {id: string}[]): Promise<number> => {
  let handledOrdersCount = 0
  let dodoToken: null | DodoToken = null
  for (const orderData of ordersData) {
    try {
      console.info(`Handling order ${JSON.stringify(orderData)}`)
      const order = OrderRT.check(orderData)
      console.info(`-> Searching order ${order.fields.Identifikátor} confirmation from "${AIRTABLES.OFFERS}" table`)
      const confirmationData = await getConfirmation(order.fields.Dárce[0])
      const confirmation = Record({ records: ArrayRT(ConfirmationRT) }).check(confirmationData)

      if (confirmation.records.length) {
        console.info(`-> Confirmation found for order ${order.fields.Identifikátor}: ${JSON.stringify(confirmation)}`)
        if (confirmation.records[0].fields['Svoz krabiček']) {
          console.info(`-> Creating new order for packages delivery for order ${order.fields.Identifikátor}`)
          await createOrderForPackages(order)
        }
        await updateOrderStatus(order.id, true)
        console.info(`-> Successfully confirmed order ${order.fields.Identifikátor}`)
      } else {
        console.info(`-> Confirmation NOT FOUND for order ${order.fields.Identifikátor}`)
        const pickupFrom = new Date(order.fields['Vyzvednout od'])
        const latestConfirmationDate = new Date(new Date().setTime(pickupFrom.getTime() - (ORDER_MUST_BE_CONFIRMED_MINUTES_BEFORE_PICKUP * 1000 * 60)))
        if (new Date() > latestConfirmationDate) {
          if (!dodoToken) {
            console.info('Getting temporary DODO oauth token')
            const dodoTokenResponse = await getDodoToken()
            dodoToken = DodoTokenRT.check(dodoTokenResponse)
            console.info(`Successfully received temporary DODO oauth token (expires in ${dodoToken.expires_in}s)`)
          }

          console.warn(`-> Canceling delivery for order ${order.fields.Identifikátor}. Latest time for confirmation ${latestConfirmationDate.toLocaleString('cs')} passed.`)
          await cancelDodoOrder(order.fields.Identifikátor, dodoToken)
          await updateOrderStatus(order.id, false)
          console.info(`-> Successfully canceled order ${order.fields.Identifikátor}`)
        }
      }

      handledOrdersCount++
    } catch (error) {
      console.error('Handling order failed', error instanceof AxiosError ? error?.response?.data || error?.message : error)
    }
  }
  return handledOrdersCount
}

export const checkOrders = async () => {
  try {
    console.info(`Loading orders from "${AIRTABLES.ORDERS}" table`)
    const ordersResponse = await getOrders()
    const { records: ordersData, offset } = Record({ records: ArrayRT(Record({ id: String })), offset: Optional(String) }).check(ordersResponse)
    console.info(`Found ${ordersData.length} order(s) in "${AIRTABLES.ORDERS}" table`)
    if (offset) console.warn(`More orders found with offset ${offset}, you should implement pagination`)

    const handledOrdersCount = await handleOrders(ordersData)
    if (handledOrdersCount !== ordersData.length) throw new Error(`Only ${handledOrdersCount}/${ordersData.length} order(s) were handled. Check logs for more info.`)

    console.info(`Script finished, ${handledOrdersCount} order(s) have been handled`)
  } catch (error) {
    console.error('Script failed', error instanceof AxiosError ? error?.response?.data || error?.message : error)
    process.exit(1)
  }
}
