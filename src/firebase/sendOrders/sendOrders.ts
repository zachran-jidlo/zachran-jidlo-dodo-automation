import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, Firestore } from 'firebase/firestore/lite'
import { COLLECTIONS, DodoTokenRT, getDodoToken } from '../common'
import { Record as RecordRT, Array as ArrayRT, String as StringRT } from 'runtypes'

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: 'zachran-obed.firebaseapp.com',
  projectId: 'zachran-obed',
  storageBucket: 'zachran-obed.appspot.com',
  messagingSenderId: '925797833830',
  appId: process.env.FIREBASE_APP_ID
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db: Firestore = getFirestore(app)

export const sendOrders = async () => {
  try {
    console.info(`Loading donors from "${COLLECTIONS.DONORS}" collection`)
    const donorsResponse = await getCollectionData(COLLECTIONS.DONORS)
    const donorsData = ArrayRT(RecordRT({ establishmentId: StringRT })).check(donorsResponse)
    console.info(`Found ${donorsData.length} donor(s) in "${COLLECTIONS.DONORS}" collection`)

    console.info(`Loading charities from "${COLLECTIONS.CHARITIES}" collection`)
    const charitiesResponse = await getCollectionData(COLLECTIONS.CHARITIES)
    const charitiesData = ArrayRT(RecordRT({ establishmentId: StringRT })).check(charitiesResponse)
    console.info(`Found ${charitiesData.length} charit(y)ies in "${COLLECTIONS.CHARITIES}" collection`)

    const charitiesMap = new Map()
    charitiesData.forEach(charityData => { charitiesMap.set(charityData.establishmentId, charityData) })

    console.info('Getting temporary DODO oauth token')
    const dodoTokenResponse = await getDodoToken()
    const dodoToken = DodoTokenRT.check(dodoTokenResponse)
    console.info(`Successfully received temporary DODO oauth token (expires in ${dodoToken.expires_in}s)`)

    const handledOrdersCount = await handleOrders(donorsData, charitiesMap, dodoToken)
    if (!handledOrdersCount) throw new Error('No orders have been handled')

    console.info(`Script finished, ${handledOrdersCount} order(s) have been handled`)
  } catch (error) {
    console.error('Script failed', error)
    process.exit(1)
  }
}

const handleOrders = async (donorsData: {establishmentId: string}[], charitiesMap: Map<string, unknown>, dodoToken: DodoToken): Promise<number> => {
  const handledOrdersCount = 0

  return handledOrdersCount
}

const getCollectionData = async (collectionName: string): Promise<unknown> => {
  const col = collection(db, collectionName)
  const colSnapshot = await getDocs(col)
  const data = colSnapshot.docs.map(doc => doc.data())
  return data
}
