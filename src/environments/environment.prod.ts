import {secrets} from './secrets';

export const environment = {
  production: true,
  useEmulators: false,
  firebase: {
    apiKey: "AIzaSyBSSyQXfi1EnO4UqoO1FlXGbySqkP6qwH0",
    authDomain: "driver-planner.firebaseapp.com",
    databaseURL: "https://driver-planner.firebaseio.com",
    projectId: "driver-planner",
    storageBucket: "driver-planner.firebasestorage.app",
    messagingSenderId: "825139309337",
    appId: "1:825139309337:web:0b867a5ad14d9110e4b388"
  },
  fcmVapidKey: 'BNYe-f2OhmCpiMPNgzkPvfPnY0rGlHKWMadpYdcflib1UEzP9uENEEyKpzaPl4MmhxV3XC62aemUzzJICPznpbE',
  notificationDispatch: {
    owner: 'simongregersen',
    repo: 'driver-planner',
    workflowFile: 'notification-poller.yml',
    token: secrets.githubDispatchToken
  }
};
