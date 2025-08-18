# 🔒 Secure P2P Chat

A real-time, secure, and ephemeral chat application built with React and WebRTC. This project allows two users to establish a direct, peer-to-peer connection to chat securely without messages ever being stored on a server.

**[Live Demo](https://secure-p2p-chat.vercel.app/)**

---

## ✨ Key Features

- **Secure P2P Connection:** Utilizes WebRTC to create a direct and encrypted connection between two peers.
- **Ephemeral Messaging:** Chat messages are never stored. The conversation disappears completely when the connection is closed.
- **Real-time Signaling:** Uses Firebase Firestore as a signaling server to help peers find and connect with each other.
- **Automatic Cleanup:** Signaling data is automatically deleted from Firestore when a user disconnects.
- **Typing Indicator:** Shows when the other user is typing a message.
- **Sound Notifications:** Plays a sound when a new message is received.
- **Professional Dark UI:** A clean and modern dark theme built with Tailwind CSS that works on both desktop and mobile.

---

## 🛠️ Tech Stack

- **Frontend:** React, Vite
- **Styling:** Tailwind CSS
- **Real-time Communication:** WebRTC
- **Signaling Server:** Google Firebase (Firestore)
- **Deployment:** Vercel

---

## 🚀 Getting Started

To run this project on your local machine, follow these steps.

### Prerequisites

- Node.js (v18 or later)
- npm

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git)
    cd YOUR_REPO_NAME
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Firebase Environment Variables:**
    - Create a project on the [Firebase Console](https://console.firebase.google.com/).
    - Add a new Web App to your project and copy your `firebaseConfig` object.
    - In the root of your project, create a new file named `.env.local`.
    - Add your Firebase keys to the `.env.local` file like this:
        ```
        VITE_API_KEY=YOUR_API_KEY
        VITE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
        VITE_PROJECT_ID=YOUR_PROJECT_ID
        # ...and so on for all the keys
        ```

4.  **Configure Firebase Security Rules:**
    - In your Firebase project, go to **Firestore Database > Rules**.
    - Replace the default rules with the following to allow signaling:
        ```javascript
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /calls/{callId}/{document=**} {
              allow read, write: if true;
            }
          }
        }
        ```
    - Publish the rules.

5.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173`.

---

## 📖 How to Use

1.  Open the application in two separate browser windows or devices.
2.  **User 1:** Enter a nickname and click **"Create Chat"**.
3.  **User 1:** Click **"Copy ID"** to copy the unique chat ID.
4.  **User 2:** Enter a nickname, paste the Chat ID into the "Enter Peer's Chat ID" field, and click **"Join Chat"**.
5.  The two users will be connected and can begin chatting securely!
