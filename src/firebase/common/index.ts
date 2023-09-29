import axios, { AxiosResponse } from 'axios'
import * as dotenv from 'dotenv'
import { Number, Record, String, Static, Literal, Optional } from 'runtypes'
dotenv.config()

export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: 'zachran-obed.firebaseapp.com',
  projectId: 'zachran-obed',
  storageBucket: 'zachran-obed.appspot.com',
  messagingSenderId: '925797833830',
  appId: process.env.FIREBASE_APP_ID
}

export const COLLECTIONS = {
  DONORS: 'canteens',
  CHARITIES: 'charities',
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
  pickupId: string,
  pickupFrom: Date,
  pickupTo: Date
  pickupNote: string,
  deliverId: string,
  deliverAddress: string,
  deliverFrom: Date,
  deliverTo: Date,
  deliverNote: string,
  customerName: string,
  customerPhone:string
}

export const DonorRT = Record({
  dodoId: String, // "zj-ad-zizkov"
  establishmentId: String, // primirest-tanvald
  establishmentName: String, // Rodinné centrum Maják
  phone: String, // +420123999888
  pickUpFrom: String, // 16:30
  pickUpWithin: String, // 17:00
  deliverFrom: String, // 17:30
  deliverWithin: String, // 18:00
  responsiblePerson: String, // Anna Strejcová
  city: String, // Prague
  street: String, // Spojená
  houseNumber: String, // 866/63
  postalCode: String, // 130 00
  recipientId: String, // zj-cck-beroun
  noteForDriver: Optional(String) // zajděte za roh a a zazvoňte na zvonek
})

export const CharityRT = Record({
  dodoID: String, // "zj-ad-zizkov"
  establishmentId: String, // primirest-tanvald
  establishmentName: String, // "Charita 1"
  phone: String, // +420123999888
  responsiblePerson: String, // Anna Strejcová
  city: String, // Prague
  street: String, // Spojená
  houseNumber: String, // 866/63
  postalCode: String, // 130 00
  noteForDriver: Optional(String) // zajděte za roh a a zazvoňte na zvonek

})

export enum OrderStatus {
  WAITING = 'Čeká',
  CONFIRMED = 'Potvrzeno',
  CANCELED = 'Storno',
}

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
