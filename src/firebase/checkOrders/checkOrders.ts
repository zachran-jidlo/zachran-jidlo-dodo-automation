import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, Firestore, setDoc, doc, query, where, Timestamp } from 'firebase/firestore/lite'
import { Record as RecordRT, Array as ArrayRT, String as StringRT, Static as StaticRT, Literal as LiteralRT } from 'runtypes'
import { COLLECTIONS, DodoToken, OrderStatus, firebaseConfig } from '../common'
import { logError, logInfo } from '../common/logger'

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db: Firestore = getFirestore(app)

const OrderRT = RecordRT({
  deliverFrom: StringRT,
  deliverWithin: StringRT,
  pickupFrom: StringRT,
  pickupWithin: StringRT,
  state: LiteralRT(OrderStatus.WAITING),
  identifier: StringRT,
  donorId: StringRT,
  recipientId: StringRT
})
type Order = StaticRT<typeof OrderRT>;

const ConfirmationRT = RecordRT({
  donorId: StringRT,
  recipientId: StringRT
})

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
  let handledOrdersCount = 0
  const dodoToken: null | DodoToken = null
  for (const orderData of ordersData) {
    try {
      console.info(`Handling order ${JSON.stringify(orderData)}`)
      const order = OrderRT.check(orderData)
      console.info(`-> Searching order ${order.identifier} confirmation from "${COLLECTIONS.OFFERS}" table`)
      const confirmationData = await getConfirmation(order.donorId, order.recipientId)
      const confirmation = ArrayRT(ConfirmationRT).check(confirmationData)

      handledOrdersCount++
    } catch (error) {
      logError('Handling order failed', error)
    }
  }

  return handledOrdersCount
}

const getConfirmation = async (donorId: string, recipientId: string): Promise<unknown> => {
  const q = query(
    collection(db, COLLECTIONS.OFFERS),
    where('donorId', '==', donorId),
    where('recipientId', '==', recipientId),
    where('date', '>', Timestamp.fromDate(new Date())),
    where('date', '<', Timestamp.fromDate(new Date(new Date().setUTCHours(23, 59))))
  )
  const querySnapshot = await getDocs(q)
  const data = querySnapshot.docs.map(doc => doc.data())

  return data
}

const getOrders = async (): Promise<unknown> => {
  const q = query(
    collection(db, COLLECTIONS.ORDERS),
    where('state', '==', OrderStatus.WAITING),
    where('deliverFrom', '>', Timestamp.fromDate(new Date())),
    where('deliverFrom', '<', Timestamp.fromDate(new Date(new Date().setUTCHours(23, 59))))
  )
  const querySnapshot = await getDocs(q)
  const data = querySnapshot.docs.map(doc => doc.data())

  return data
}
