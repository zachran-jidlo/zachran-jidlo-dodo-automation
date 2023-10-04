import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, Firestore, setDoc, doc, query, where, Timestamp, DocumentReference } from 'firebase/firestore/lite'
import { Record as RecordRT, Array as ArrayRT, String as StringRT, Static as StaticRT, Literal as LiteralRT, InstanceOf as InstanceOfRT } from 'runtypes'
import { COLLECTIONS, DodoToken, OrderStatus, firebaseConfig } from '../common'
import { logError, logInfo } from '../common/logger'

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db: Firestore = getFirestore(app)

const OrderRT = RecordRT({
  deliverFrom: InstanceOfRT(Timestamp),
  deliverWithin: InstanceOfRT(Timestamp),
  pickUpFrom: InstanceOfRT(Timestamp),
  pickUpWithin: InstanceOfRT(Timestamp),
  state: LiteralRT(OrderStatus.WAITING),
  identifier: StringRT,
  donorId: StringRT,
  recipientId: StringRT
})
type Order = StaticRT<typeof OrderRT> & { ref: DocumentReference };

const ConfirmationRT = RecordRT({
  donorId: StringRT,
  recipientId: StringRT
})

export const checkOrders = async () => {
  try {
    logInfo(`Loading orders from "${COLLECTIONS.ORDERS}" collection`)
    const ordersResponse = await getOrders()
    const ordersData = ArrayRT(RecordRT({ identifier: StringRT })).check(ordersResponse)
    logInfo(`Found ${ordersData.length} orders(s) in "${COLLECTIONS.ORDERS}" collection`)

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
      logInfo(`Handling order ${JSON.stringify(orderData)}`)
      const order = OrderRT.check(orderData) as Order
      logInfo(`-> Searching order ${order.identifier} confirmation from "${COLLECTIONS.OFFERS}" table`)
      const confirmationData = await getConfirmation(order.donorId, order.recipientId)
      const confirmation = ArrayRT(ConfirmationRT).check(confirmationData)

      if (confirmation.length) {
        logInfo(`-> Confirmation found for order ${order.identifier}: ${JSON.stringify(confirmation)}`)
        await updateOrderStatus(order.ref, OrderStatus.CONFIRMED)
        logInfo(`-> Successfully confirmed order ${order.identifier}`)
      } else {
        logInfo(`-> Confirmation NOT FOUND for order ${order.identifier}`)
      }

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
  const data = querySnapshot.docs.map(doc => {
    const order = doc.data()
    order.ref = doc.ref
    return order
  })

  return data
}

const updateOrderStatus = async (orderRef: DocumentReference, status: OrderStatus = OrderStatus.WAITING): Promise<void> => {
  await setDoc(orderRef,
    {
      state: status
    }
    ,
    { merge: true }
  )
}
