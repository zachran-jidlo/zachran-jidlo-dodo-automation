import axios from 'axios'
import * as dotenv from 'dotenv'
import { Number, Record, String, Static, Literal } from 'runtypes'
dotenv.config()

export const DODO_ORDERS_API = 'http://api-staging.gaia.delivery/integrations/v2/zachran-jidlo/orders'
const DODO_OAUTH_URI = 'https://login.microsoftonline.com/1b9b966e-0ce7-44ed-a2df-83446c830a18/oauth2/v2.0/token'

export const axiosAirtable = axios.create({
  baseURL: 'https://api.airtable.com/v0/apppCzTfDnvgah1Z3/',
  headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY || ''}` }
})

export const AIRTABLES = {
  DONORS: 'Dárci',
  CHARITIES: 'Příjemci',
  ORDERS: 'Rozvozy',
  OFFERS: 'Nabídka'
}

export const DodoTokenRT = Record({
  token_type: Literal('Bearer'),
  expires_in: Number,
  ext_expires_in: Number,
  access_token: String
})

export type DodoToken = Static<typeof DodoTokenRT>;

export const getDodoToken = async (): Promise<unknown> => {
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
