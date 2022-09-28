import * as dotenv from 'dotenv'
import axios, { AxiosError } from 'axios'
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
  CHARITIES: 'Příjemci'
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

const createOrder = async (donor: Donor, charity: Charity, token: DodoToken): Promise<unknown> => {
  const pickupStart = getDateAfter7days(donor.fields['Vyzvednout od'])
  const pickupEnd = getDateAfter7days(donor.fields['Vyzvednout do'])
  const dropStart = getDateAfter7days(donor.fields['Doručit od'])
  const dropEnd = getDateAfter7days(donor.fields['Doručit do'])
  const identifier = `${donor.fields.ID}-${charity.fields.ID}-${pickupStart.toLocaleDateString('cs')}`.toLowerCase().replace(/ /g, '')

  try {
    const { data } = await axios.post(
      DODO_ORDERS_API,
      {
        Identifier: identifier,
        Pickup: {
          BranchIdentifier: 'test-restaurace-11',
          pickupStart: pickupStart.toISOString(),
          pickupEnd: pickupEnd.toISOString()
        },
        Drop: {
          AddressRawValue: charity.fields.Adresa, // Valid delivery address
          pickupStart: dropStart,
          pickupEnd: dropEnd
        },
        CustomerName: charity.fields['Odpovědná osoba'],
        CustomerPhone: charity.fields['Telefonní číslo'],
        Price: 0
      },
      {
        headers: { Authorization: `Bearer ${token.access_token || ''}` },
        timeout: 30000
      }
    )

    console.info(`Successfully sent order "${identifier}" from donor "${donor.fields.ID}" to charity "${charity.fields.ID}" with pickup ${pickupStart.toLocaleString('cs')}-${pickupEnd.toLocaleString('cs')}`)
    return data
  } catch (error) {
    console.warn(`Failed sent order "${identifier}" from donor "${donor.fields.ID}" to charity "${charity.fields.ID}" with pickup ${pickupStart.toLocaleString('cs')}-${pickupEnd.toLocaleString('cs')}`, error instanceof AxiosError ? error.response?.data || error.message : error)
    return {}
  }
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
  try {
    console.info(`Loading donors from "${AIRTABLES.DONORS}" table`)
    const donorsResponse = await getDonors()
    const { records: donors } = Record({ records: Array(DonorRT) }).check(donorsResponse)
    console.info(`Found ${donors.length} donor(s) in "${AIRTABLES.DONORS}" table`)

    console.info(`Loading charities from "${AIRTABLES.CHARITIES}" table`)
    const charitiesResponse = await getCharities()
    const { records: charities } = Record({ records: Array(CharityRT) }).check(charitiesResponse)
    console.info(`Found ${donors.length} charit(y)ies in "${AIRTABLES.CHARITIES}" table`)
    const charitiesMap = new Map()
    charities.forEach(charity => { charitiesMap.set(charity.id, charity) })
    console.log(donors, charitiesMap)

    console.info('Getting temporary DODO oauth token')
    const dodoTokenResponse = await getDodoToken()
    const dodoToken = DodoTokenRT.check(dodoTokenResponse)
    console.info(`Successfully received temporary DODO oauth token (expires in ${dodoToken.expires_in}s)`)

    console.info('Sending orders to DODO')
    const results = await Promise.allSettled(
      donors.map(donor =>
        donor.fields.Příjemce.map(charity => createOrder(donor, charitiesMap.get(charity), dodoToken))
      )
    )
    let failedOrders = 0
    results.forEach(result => {
      if (result.status !== 'fulfilled') {
        failedOrders++
      }
    })
  } catch (error) {
    console.error('Script failed', error)
  }
}
