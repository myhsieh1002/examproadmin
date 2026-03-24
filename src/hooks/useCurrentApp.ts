'use client'
import { createContext, useContext } from 'react'

type AppContextType = {
  currentApp: string
  setCurrentApp: (app: string) => void
  userRole: string | null
  userId: string | null
}

export const AppContext = createContext<AppContextType>({
  currentApp: 'npexam',
  setCurrentApp: () => {},
  userRole: null,
  userId: null,
})

export const useCurrentApp = () => useContext(AppContext)
