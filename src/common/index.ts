import axios from 'axios'
import * as dotenv from 'dotenv'
dotenv.config()

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
