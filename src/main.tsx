import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './WorkspaceApp';
import './styles.css';
import './interface.css';
import './studio.css';
import './visual-theme.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
