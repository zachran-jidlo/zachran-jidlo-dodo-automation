import axios, { AxiosResponse } from 'axios'
import * as dotenv from 'dotenv'
import { Number, Record, String, Static, Literal, Optional, Array } from 'runtypes'
dotenv.config()

export const COLLECTIONS = {
  DONORS: 'donors',
  CHARITIES: 'recipients',
  ORDERS: 'deliveries',
  OFFERS: 'offeredFood'
}

export const DodoTokenRT = Record({
  token_type: Literal('Bearer'),
  expires_in: Number,
  ext_expires_in: Number,
  access_token: String
})

const EnvVariablesRT = Record({
  AIRTABLE_API_KEY: String,
  DODO_SCOPE: String,
  DODO_CLIENT_ID: String,
  DODO_CLIENT_SECRET: String,
  DODO_OAUTH_URI: String,
  DODO_ORDERS_API: String
})

export type DODOOrder = {
  id: string,
  pickupDodoId: string,
  pickupAirtableId: string,
  pickupFrom: Date,
  pickupTo: Date
  pickupNote: string,
  deliverAirtableId: string,
  deliverAddress: string,
  deliverFrom: Date,
  deliverTo: Date,
  deliverNote: string,
  customerName: string,
  customerPhone:string
}

export const DonorRT = Record({
  id: String,
  fields: Record({
    ID: String, // "Zachraň jídlo"
    'Telefonní číslo': String, // +420123999888
    'Vyzvednout od': Number, // 50400
    'Vyzvednout do': Number, // 30000
    'Doručit od': Number, // 50800
    'Doručit do': Number, // 60800
    'Odpovědná osoba': String, // Anna Strejcová
    Adresa: String, // Spojená 22
    Oblast: Optional(String), // Praha 3
    Příjemce: Array(String), // ["rec8116cdd76088af"]
    Poznámka: Optional(String) // zajděte za roh a a zazvoňte na zvonek
  })
})

export const CharityRT = Record({
  id: String,
  fields: Record({
    Název: String, // "Charita 1"
    ID: Optional(String), // "zj-ad-zizkov"
    'Telefonní číslo': String, // +420123999888
    'Odpovědná osoba': String, // Anna Strejcová
    Adresa: String, // Spojená 22, Praha 3, 130000
    Oblast: Optional(String), // Praha 3
    Poznámka: Optional(String) // zajděte za roh a a zazvoňte na zvonek
  })
})

EnvVariablesRT.check(process.env)

export type DodoToken = Static<typeof DodoTokenRT>;

export const getDodoToken = async (): Promise<unknown> => {
  const params = new URLSearchParams()
  params.append('grant_type', 'client_credentials')
  params.append('scope', process.env.DODO_SCOPE || '')
  params.append('client_id', process.env.DODO_CLIENT_ID || '')
  params.append('client_secret', process.env.DODO_CLIENT_SECRET || '')

  const { data } = await axios.post(
    process.env.DODO_OAUTH_URI || '',
    params
  )
  return data
}

export const createOrder = async (order: DODOOrder, token: DodoToken): Promise<AxiosResponse<unknown>> => {
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
