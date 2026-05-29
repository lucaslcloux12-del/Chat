import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyARHwI3Y9Zpc7-QwxDMktdB-CQBD-lpYKA",
  authDomain: "chat-sec1.firebaseapp.com",
  databaseURL: "https://chat-sec1-default-rtdb.firebaseio.com",
  projectId: "chat-sec1",
  storageBucket: "chat-sec1.firebasestorage.app",
  messagingSenderId: "448936736298",
  appId: "1:448936736298:web:274304a1bab9071d1cb553"
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)

