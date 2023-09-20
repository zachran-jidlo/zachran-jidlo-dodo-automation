import { initializeApp, FirebaseError } from 'firebase/app'
import { getFirestore, collection, getDocs, Firestore, setDoc, doc } from 'firebase/firestore/lite'
import { COLLECTIONS, CharityRT, DODOOrder, DodoToken, DodoTokenRT, DonorRT, createOrder, firebaseConfig, getDodoToken } from '../common'
import { Record as RecordRT, Array as ArrayRT, String as StringRT } from 'runtypes'
import { AxiosError, AxiosResponse } from 'axios'

// Initialize Firebase
const app = initializeApp(firebaseConfig)
const db: Firestore = getFirestore(app)

export const sendOrders = async () => {
  try {
    logInfo(`Loading donors from "${COLLECTIONS.DONORS}" collection`)
    const donorsResponse = await getCollectionData(COLLECTIONS.DONORS)
    const donorsData = ArrayRT(RecordRT({ establishmentId: StringRT })).check(donorsResponse)
    logInfo(`Found ${donorsData.length} donor(s) in "${COLLECTIONS.DONORS}" collection`)

    logInfo(`Loading charities from "${COLLECTIONS.CHARITIES}" collection`)
    const charitiesResponse = await getCollectionData(COLLECTIONS.CHARITIES)
    const charitiesData = ArrayRT(RecordRT({ establishmentId: StringRT })).check(charitiesResponse)
    logInfo(`Found ${charitiesData.length} charit(y)ies in "${COLLECTIONS.CHARITIES}" collection`)

    const charitiesMap = new Map()
    charitiesData.forEach(charityData => { charitiesMap.set(charityData.establishmentId, charityData) })

    logInfo('Getting temporary DODO oauth token')
    const dodoTokenResponse = await getDodoToken()
    const dodoToken = DodoTokenRT.check(dodoTokenResponse)
    logInfo(`Successfully received temporary DODO oauth token (expires in ${dodoToken.expires_in}s)`)

    const handledOrdersCount = await handleOrders(donorsData, charitiesMap, dodoToken)
    if (!handledOrdersCount) throw new Error('No orders have been handled')

    logInfo(`Script finished, ${handledOrdersCount} order(s) have been handled`)
  } catch (error) {
    logError('Script failed', error)
    process.exit(1)
  }
}

const handleOrders = async (donorsData: {establishmentId: string}[], charitiesMap: Map<string, unknown>, dodoToken: DodoToken): Promise<number> => {
  let handledOrdersCount = 0
  for (const donorData of donorsData) {
    try {
      logDebug(`Handling donor ${JSON.stringify(donorData)}`)
      const donor = DonorRT.check(donorData)

      if (!charitiesMap.has(donor.recipientId)) { throw new Error(`No charity with dodoId: ${donor.recipientId}`) }
      const charity = CharityRT.check(charitiesMap.get(donor.recipientId))

      const order: DODOOrder = {
        id: `${donor.dodoId}-${charity.establishmentName}-${getDateAfter3days().toLocaleDateString('cs')}`.toLowerCase().replace(/ /g, ''),
        pickupDodoId: donor.dodoId,
        pickupId: donor.establishmentId,
        pickupTo: getDateAfter3days(donor.pickUpFrom),
        pickupFrom: getDateAfter3days(donor.pickUpWithin),
        pickupNote: donor.noteForDriver || '',
        deliverAddress: `${charity.street} ${charity.houseNumber} ${charity.city} ${charity.postalCode}`,
        deliverId: charity.establishmentId,
        deliverTo: getDateAfter3days(donor.deliverFrom),
        deliverFrom: getDateAfter3days(donor.deliverWithin),
        deliverNote: charity.noteForDriver || '',
        customerName: charity.responsiblePerson,
        customerPhone: charity.phone
      }

      logDebug(`-> Creating order ${JSON.stringify(order)} on DODO`)
      await createOrder(order, dodoToken)

      console.info(`-> Adding order ${order.id} to ${COLLECTIONS.ORDERS} table`)
      await saveOrderToFirabase(order)

      handledOrdersCount++
    } catch (error) {
      logError('Handling donor failed', error)
    }
  }
  return handledOrdersCount
}

const saveOrderToFirabase = async (order: DODOOrder, status: 'čeká' | 'storno' = 'čeká'): Promise<void> => {
  const collectionRef = collection(db, COLLECTIONS.ORDERS)
  const docRef = doc(collectionRef)
  const documentUuid = docRef.id

  await setDoc(docRef,
    {
      uuid: documentUuid,
      recipientId: order.deliverId,
      donorId: order.pickupId,
      pickUpFrom: order.pickupFrom.toISOString(),
      pickUpWithin: order.pickupTo.toISOString(),
      deliverFrom: order.deliverFrom.toISOString(),
      deliverWithin: order.deliverTo.toISOString(),
      identifier: '2',
      state: status

    }
  )
}

const getCollectionData = async (collectionName: string): Promise<unknown> => {
  const col = collection(db, collectionName)
  const colSnapshot = await getDocs(col)
  const data = colSnapshot.docs.map(doc => doc.data())
  return data
}

const getDateAfter3days = (time = '00:00'): Date => {
  const date = new Date()
  date.setDate(date.getDate() + 3)
  date.setUTCHours(parseInt(time.split(':')[0]))
  date.setUTCMinutes(parseInt(time.split(':')[1]))
  date.setUTCSeconds(0)

  return date
}

const logError = (message: string, error?: unknown) => {
  console.error(`ERROR: ${message}`, error instanceof FirebaseError ? error?.message : error instanceof AxiosError ? error?.response?.data : error instanceof Error ? error.message : error)
}

const logInfo = (message: string) => {
  console.info(`INFO: ${message}`)
}

const logDebug = (message: string) => {
  console.info(`DEBUG: ${message}`)
}
