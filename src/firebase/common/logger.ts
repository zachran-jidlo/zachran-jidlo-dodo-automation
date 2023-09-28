import { AxiosError } from 'axios'
import { FirebaseError } from 'firebase/app'

export const logError = (message: string, error?: unknown) => {
  console.error(`ERROR: ${message}`, error instanceof FirebaseError ? error?.message : error instanceof AxiosError ? error?.response?.data : error instanceof Error ? error.message : error)
}

export const logInfo = (message: string) => {
  console.info(`INFO: ${message}`)
}

export const logDebug = (message: string) => {
  console.info(`DEBUG: ${message}`)
}
