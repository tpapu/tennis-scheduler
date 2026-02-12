# 🎾 Tennis Scheduler

A modern, full-featured tennis coaching scheduling application built with React and Supabase. Manage appointments, availability, and client information with a beautiful, responsive interface.

![Tennis Scheduler](https://img.shields.io/badge/version-1.0.0-blue)
![React](https://img.shields.io/badge/React-18.2.0-61dafb)
![Supabase](https://img.shields.io/badge/Supabase-2.38.0-3ecf8e)

## ✨ Features

### 📅 Dual View System
- **Client View**: Public-facing schedule showing available time slots
- **Coach View**: Private dashboard for managing all appointments and availability

### 🗓️ Multiple Calendar Views
- **Week View**: See appointments across a full week with hourly breakdown
- **Month View**: Bird's-eye view of the entire month's schedule
- **List View**: Chronological list of all upcoming appointments

### ⏰ Flexible Time Management
- **Any-minute precision**: Schedule appointments at any time (3:15 PM, 4:47 PM, etc.)
- **30-minute grid display**: Clean UI with appointments positioned precisely
- **Back-to-back scheduling**: Book consecutive lessons without conflicts
- **Timezone-aware**: Handles PST/PDT correctly

### 👥 Client Management
- Store client details (name, phone, email)
- Add court locations and session notes
- Track appointment history

### 🎨 Modern UI/UX
- **Dark Mode**: Toggle between light and dark themes
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Smooth Animations**: Professional transitions and interactions
- **Lucide Icons**: Beautiful, consistent iconography

### 📤 Calendar Integration
- **Import from Google Calendar**: Upload .ics files to bulk import events
- **Export capability**: Share your schedule with clients

### 🔐 Authentication & Security
- **Supabase Auth**: Secure email/password authentication
- **Row Level Security**: Client data protected at the database level
- **Coach-specific access**: Only authenticated coaches can edit schedules

### 🎯 Additional Features
- Appointment types: Booked, Blocked, Available
- Duplicate appointment cleanup
- Edit and delete appointments with confirmation
- Profile customization (name, bio, colors, links)
- Slug-based URLs for each coach (e.g., `/alex`)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- A Supabase account
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/tennis-scheduler.git
cd tennis-scheduler
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

#### Create a Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key

#### Run Database Setup

In your Supabase SQL Editor, run these scripts in order:

**1. Create Tables:**

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Coaches table
CREATE TABLE coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  public_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Availability slots table
CREATE TABLE availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT availability_slots_no_overlap
    EXCLUDE USING gist (
      coach_id WITH =,
      tstzrange(start_time, end_time, '[)') WITH &&
    )
);

-- Private appointments table
CREATE TABLE appointments_private (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  client_name TEXT,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT appointments_private_no_overlap
    EXCLUDE USING gist (
      coach_id WITH =,
      tstzrange(start_time, end_time, '[)') WITH &&
    )
);

-- Indexes for performance
CREATE INDEX idx_availability_coach_time ON availability_slots(coach_id, start_time);
CREATE INDEX idx_appointments_coach_time ON appointments_private(coach_id, start_time);
CREATE INDEX idx_coaches_slug ON coaches(slug);
```

**2. Set Up Row Level Security (RLS):**

```sql
-- Enable RLS
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments_private ENABLE ROW LEVEL SECURITY;

-- Coaches: Public read, owner write
CREATE POLICY "Coaches are viewable by everyone"
  ON coaches FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own coach profile"
  ON coaches FOR UPDATE
  USING (auth.uid() = user_id);

-- Availability: Public read open slots, coach can manage all
CREATE POLICY "Open availability is viewable by everyone"
  ON availability_slots FOR SELECT
  USING (status = 'open' OR auth.uid() IN (SELECT user_id FROM coaches WHERE id = coach_id));

CREATE POLICY "Coaches can manage their availability"
  ON availability_slots FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM coaches WHERE id = coach_id));

-- Appointments: Only coach can see/manage
CREATE POLICY "Coaches can view their appointments"
  ON appointments_private FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM coaches WHERE id = coach_id));

CREATE POLICY "Coaches can manage their appointments"
  ON appointments_private FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM coaches WHERE id = coach_id));
```

**3. Create Your Coach Profile:**

```sql
-- First, sign up through the app to create an auth user
-- Then run this with your user_id (found in Supabase Auth dashboard)

INSERT INTO coaches (user_id, slug, display_name, public_note)
VALUES (
  'YOUR_USER_ID_HERE',  -- Replace with your actual user_id from auth.users
  'yourname',           -- Your URL slug (e.g., /alex)
  'Your Name',          -- Display name
  'USPTA certified tennis coach with 10+ years experience'  -- Optional bio
);
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 5. Create Required Files

Create the following file structure:

```
tennis-scheduler/
├── public/
│   ├── index.html
│   └── _redirects
├── src/
│   ├── App.js
│   ├── index.js
│   ├── index.css
│   └── supabaseClient.js
├── package.json
├── .env
└── README.md
```

**public/index.html:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Tennis coaching scheduler" />
    <title>Tennis Scheduler</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
```

**public/_redirects:**
```
/*    /index.html   200
```

**src/index.js:**
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**src/index.css:**
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.dark-mode {
  background-color: #111827;
  color: #f9fafb;
}
```

**src/supabaseClient.js:**
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 6. Run the Development Server

```bash
npm start
```

Visit `http://localhost:3000` to see your app!

---

## 📦 Deployment

### Deploy to Netlify

#### Option 1: Via GitHub (Recommended)

1. Push your code to GitHub
2. Go to [netlify.com](https://netlify.com) and sign in
3. Click "Add new site" → "Import an existing project"
4. Connect to GitHub and select your repository
5. Configure build settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `build`
6. Add environment variables:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
7. Click "Deploy site"

#### Option 2: Via Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Initialize
netlify init

# Set environment variables
netlify env:set REACT_APP_SUPABASE_URL "your_url"
netlify env:set REACT_APP_SUPABASE_ANON_KEY "your_key"

# Deploy
npm run build
netlify deploy --prod
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# Then redeploy
vercel --prod
```

---

## 🎯 Usage Guide

### For Coaches

#### Initial Setup
1. Sign up with your email and password
2. Make sure your coach profile exists in Supabase (see database setup)
3. Log in and switch to "Coach Dashboard"

#### Managing Appointments
- **Add Appointment**: Click the green "Add Appointment" button
- **Edit Appointment**: Click on any appointment card to edit details
- **Delete Appointment**: Click delete in the edit modal (with confirmation)
- **Block Time**: Create a "blocked" slot to mark unavailable times

#### Calendar Views
- **Week View**: Best for day-to-day scheduling
- **Month View**: Great for seeing patterns and planning ahead
- **List View**: Quick chronological overview

#### Import from Google Calendar
1. Export your Google Calendar as .ics file
2. Click "Import Calendar" button
3. Select your .ics file
4. All events will be imported as booked appointments

#### Profile Customization
1. Click "Edit Profile" in the coach dashboard
2. Update your name, bio, and links
3. Customize colors and branding
4. Changes are saved automatically

### For Clients

1. Visit your coach's URL (e.g., `yoursite.com/alex`)
2. Browse available time slots
3. Contact your coach to book (booking widget coming soon!)

---

## 🔧 Configuration

### Timezone Settings

The app is configured for **Pacific Time (PST/PDT)**. To change timezone:

In `App.js`, update the `getPSTDate` function:

```javascript
const getPSTDate = (date = new Date()) => {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const timezoneOffset = -8; // Change this: -8 for PST, -5 for EST, etc.
  return new Date(utc + (3600000 * timezoneOffset));
};
```

### Time Slot Configuration

To change the available time range (default: 6 AM - 10 PM):

```javascript
// In App.js, find this line:
const timeSlots = Array.from({ length: 33 }, (_, i) => 6 + (i * 0.5));

// Change to different hours (example: 7 AM - 9 PM):
const timeSlots = Array.from({ length: 29 }, (_, i) => 7 + (i * 0.5));
```

### Color Customization

Update default colors in `App.js`:

```javascript
setCoachData({
  // ...
  backgroundColor: '#1a472a',  // Main background
  bannerColor: 'linear-gradient(135deg, #1a472a 0%, #2d5a3d 50%, #1a472a 100%)',
  textColor: '#ffffff',
  accentColor: '#10b981'
});
```

---

## 🐛 Troubleshooting

### Back-to-Back Appointments Not Working

If you get "conflicting key value violates exclusion constraint" errors:

1. Go to Supabase SQL Editor
2. Run the constraint fix:

```sql
-- Drop old constraint
ALTER TABLE appointments_private 
DROP CONSTRAINT IF EXISTS appointments_private_no_overlap;

-- Create new constraint with exclusive end time
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments_private
ADD CONSTRAINT appointments_private_no_overlap
EXCLUDE USING gist (
  coach_id WITH =,
  tstzrange(start_time, end_time, '[)') WITH &&
);
```

The `'[)'` syntax means the end time is **exclusive**, so:
- Appointment 1: 3:00 PM - 4:30 PM ✅
- Appointment 2: 4:30 PM - 6:00 PM ✅
- These will NOT conflict!

### Appointments Showing on Wrong Day

This was a timezone bug that has been fixed. Make sure you're using the latest `App.js`.

### Can't See Appointments After Creating

Make sure:
1. You're logged in as the coach
2. Your user_id matches the coach record in the database
3. RLS policies are set up correctly

Check the browser console for errors.

### Modal Not Opening

Check that `showAddApptModal` state is being set correctly. Look for console errors.

---

## 📚 API Reference

### Database Schema

#### `coaches`
```sql
id              UUID PRIMARY KEY
user_id         UUID (references auth.users)
slug            TEXT UNIQUE
display_name    TEXT
public_note     TEXT
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `availability_slots`
```sql
id              UUID PRIMARY KEY
coach_id        UUID (references coaches)
start_time      TIMESTAMPTZ
end_time        TIMESTAMPTZ
status          TEXT ('open' or 'closed')
created_at      TIMESTAMPTZ
```

#### `appointments_private`
```sql
id              UUID PRIMARY KEY
coach_id        UUID (references coaches)
start_time      TIMESTAMPTZ
end_time        TIMESTAMPTZ
client_name     TEXT
location        TEXT
notes           TEXT
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### Key Functions

#### Time Conversion
- `formatTime(hour)` - Convert decimal hour to "3:30 PM" format
- `decimalToTimeString(decimal)` - Convert 15.5 → "15:30"
- `timeStringToDecimal(string)` - Convert "15:30" → 15.5
- `slotToISO(date, hour)` - Convert to ISO timestamp for database

#### Data Management
- `refreshScheduleFromSupabase()` - Reload all appointments
- `createAppointmentFromModal()` - Create new appointment
- `updateTimeSlot(id, updates)` - Update existing appointment
- `deleteTimeSlot(id)` - Delete appointment

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:


## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- **React** - UI framework
- **Supabase** - Backend and authentication
- **Lucide React** - Beautiful icons
- **Tailwind CSS** - Utility-first styling (via inline classes)



**Version 0.3.0 | Last Updated: February 2026**
