'use client'
import { createContext, useContext } from 'react'

type AppContextType = {
  currentApp: string
  setCurrentApp: (app: string) => void
}

export const AppContext = createContext<AppContextType>({
  currentApp: 'npexam',
  setCurrentApp: () => {},
})

export const useCurrentApp = () => useContext(AppContext)
