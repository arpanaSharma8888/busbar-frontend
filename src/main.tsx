
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import 'uplot/dist/uPlot.min.css';

import App from './App';
import { Provider } from 'react-redux';
import { store } from './store';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily: 'Inter, Arial, sans-serif',
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Provider store={store}><App /></Provider>
    </MantineProvider>
  </React.StrictMode>
);
