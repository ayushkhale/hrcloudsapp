import React, { createContext, useCallback, useContext, useState } from 'react';

const DrawerContext = createContext({
  open: false,
  openDrawer: () => {},
  closeDrawer: () => {},
});

export function DrawerProvider({ children }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  return (
    <DrawerContext.Provider value={{ open, openDrawer, closeDrawer }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer() {
  return useContext(DrawerContext);
}

export default DrawerContext;
