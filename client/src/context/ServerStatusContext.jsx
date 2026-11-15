import { createContext, useContext } from 'react';
import useServerStatus from '../hooks/useServerStatus.js';

// One shared health poll for the whole signed-in app (sidebar, header, banners).
const ServerStatusContext = createContext({ status: 'checking', recheck: () => {} });

export function ServerStatusProvider({ children }) {
  const value = useServerStatus();
  return <ServerStatusContext.Provider value={value}>{children}</ServerStatusContext.Provider>;
}

export function useServer() {
  return useContext(ServerStatusContext);
}

export default ServerStatusContext;
