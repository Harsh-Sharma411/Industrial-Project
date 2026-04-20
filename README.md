HEAD
# Industrial-Project

Experiment: Experiential Based Learning
Project Title:

Lawgic – Legal Dispute Resolution and Lawyer Hiring Web Application

Project Idea:

Lawgic is a web-based platform that helps individuals resolve legal disputes efficiently by connecting them with verified lawyers and providing a structured system to manage and track case progress.

Aim:

To design and develop a scalable web application that simplifies legal dispute resolution and enables users to find, connect with, and hire suitable lawyers through a secure and user-friendly platform.

Objectives:
To provide a centralized platform for legal assistance
To simplify the process of finding and hiring lawyers
To enable users to manage and track dispute cases digitally
To ensure secure communication between users and legal professionals
Key Features:
1. Lawyer Discovery & Hiring
Users can search and filter lawyers based on specialization, location, and ratings
Easy hiring process through the platform
2. Case Management System
Users can create and manage legal cases
Track case status, updates, and progress
3. Secure Authentication
User and lawyer login system
Role-based access (client/lawyer/admin)
4. Real-Time Communication
Chat or messaging system between client and lawyer
Instant updates on case activities
5. Document Management
Upload and manage legal documents securely
Easy sharing between clients and lawyers
Additional Features:
1. Review & Rating System
Users can rate lawyers based on experience
Helps others choose better legal assistance
2. Appointment Scheduling
Book consultations with lawyers
Schedule meetings online
3. Notification System
Alerts for case updates, messages, and appointments
Technology Stack:
Frontend: React.js
Styling: Tailwind CSS
Backend: Firebase (Authentication & Services)
Database: Cloud Firestore (NoSQL)
State Management: React Context API
Setup Instructions:
1. Initialize Environment
npx create-react-app lawgic
cd lawgic
2. Install Dependencies
npm install firebase tailwindcss
3. Firebase Configuration
Create project in Firebase Console
Enable Authentication and Firestore Database
4. Tailwind Setup
npx tailwindcss init
Configure content paths in tailwind.config.js
Deployment:
npm run build
Deploy using Firebase Hosting or Vercel
Challenges & Solutions:
1. Data Privacy & Security
Implemented secure authentication and Firestore rules
2. Real-Time Updates
Used live listeners for instant case updates
3. Role Management
Designed role-based access control for users and lawyers
Learning Outcomes:
Gained experience in building a full-stack legal-tech platform
Learned secure authentication and data handling
Improved UI/UX design using Tailwind CSS
Understood real-world problem solving in legal domain
Conclusion:

Lawgic provides a modern digital solution for legal dispute resolution by bridging the gap between clients and lawyers. It simplifies legal processes, enhances accessibility, and ensures secure and efficient case management.

# Lawgic AI

Lawgic AI is scaffolded as a React + Vite app for:

- land dispute intake
- rental agreement disputes
- general legal case summaries
- AI text and voice-assisted support
- lawyer portfolio discovery with reviews and filtering

## Run locally

1. `npm install`
2. Configure `.env`
3. In terminal one, run `npm run server`
4. In terminal two, run `npm run dev`
5. Open the Vite URL, usually `http://localhost:5173`

## PostgreSQL

The app now uses PostgreSQL for users, sessions, lawyers, and cases.

## Demo admin

- Email: `admin@lawgic.ai`
- Password: `admin123`

## OpenAI assistant

1. Copy `.env.example` to `.env`
2. Set `OPENAI_API_KEY`
3. Optionally change `OPENAI_MODEL`
4. Restart `npm run server`

Default model: `gpt-5.4-mini`

## Included

- componentized React UI
- interactive AI assistant demo
- browser voice recognition support
- case upload and intake summary flow
- searchable lawyer portfolio section
- Vite config and package manifest for future backend integration
- Express backend with lawyer, assistant, and case submission APIs
- JSON file persistence in `server/data`
- Registration, login, session-based auth, and admin stats
- Admin lawyer creation from the frontend

