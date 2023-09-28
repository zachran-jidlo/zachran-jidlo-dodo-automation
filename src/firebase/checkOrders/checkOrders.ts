import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, Firestore, setDoc, doc, query, where, Timestamp } from 'firebase/firestore/lite'
import { Record as RecordRT, Array as ArrayRT, String as StringRT } from 'runtypes'
import { COLLECTIONS, firebaseConfig } from '../common'
import { logError, logInfo } from '../common/logger'

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db: Firestore = getFirestore(app)

export const checkOrders = async () => {
  try {
    console.info(`Loading orders from "${COLLECTIONS.ORDERS}" collection`)
    const ordersResponse = await getOrders()
    const ordersData = ArrayRT(RecordRT({ identifier: StringRT })).check(ordersResponse)
    console.info(`Found ${ordersData.length} orders(s) in "${COLLECTIONS.ORDERS}" collection`)

    const handledOrdersCount = await handleOrders(ordersData)
    if (handledOrdersCount !== ordersData.length) throw new Error(`Only ${handledOrdersCount}/${ordersData.length} orders(s) were handled. Check logs for more info.`)

    logInfo(`Script finished, ${handledOrdersCount} orders(s) have been handled`)
  } catch (error) {
    logError('Script failed', error)
    process.exit(1)
  }
}

const handleOrders = async (ordersData: {identifier: string}[]): Promise<number> => {
  const handledOrdersCount = 0

  return handledOrdersCount
}

const getOrders = async (): Promise<unknown> => {
  const q = query(
    collection(db, COLLECTIONS.ORDERS),
    where('state', '==', 'Čeká'),
    where('deliverFrom', '>', Timestamp.fromDate(new Date())),
    where('deliverFrom', '<', Timestamp.fromDate(new Date(new Date().setUTCHours(23, 59))))
  )
  const querySnapshot = await getDocs(q)
  const data = querySnapshot.docs.map(doc => doc.data())

  return data
}
