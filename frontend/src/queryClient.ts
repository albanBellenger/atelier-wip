import { MutationCache, QueryClient } from '@tanstack/react-query'

import { showApiError } from './utils/apiErrorToast'

export const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    if (mutation.meta?.skipGlobalToast === true) {
      return
    }
    showApiError(error)
  },
})

export const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
})
