# MSA Registration Portal

A simple registration and attendance portal for managing student or participant sign-ups.

## Features
- Student registration form
- Admin portal for viewing and managing entries
- Attendance import and purge tools
- Responsive web interface

## Project Structure
- `index.html` — landing page
- `portal.html` — main registration portal
- `admin.html` — admin dashboard
- `student.html` / `teacher.html` — role-based pages
- `firebase-config.js` — Firebase configuration
- `*.js` — app logic and UI behavior

## Setup
1. Open the project folder in your browser or host it with a static server.
2. Update Firebase settings in `firebase-config.js`.
3. Make sure your Firebase rules allow read/write access for the app.

## Deployment
You can deploy this project to GitHub Pages, Netlify, Vercel, or any static hosting service.

## Notes
- This project uses Firebase for data storage.
- If you want to use it in production, review security rules and authentication setup.
