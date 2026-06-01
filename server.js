import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config'; 
import { google } from 'googleapis';

const app = express();
app.use(cors()); 
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/oauth2callback' 
);

// Helper array tracking strings to map day numbers dynamically
const DAYS_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ==========================================
// 1. TIMETABLE EXTRACTION ROUTE
// ==========================================
app.post('/api/extract-schedule', upload.single('timetable'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }

        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        const prompt = `
            Analyze this university timetable image. Extract all course slots and format them into a valid JSON array.
            Each object in the array must strictly match this schema:
            {
                "day": "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", or "Sunday"
                "course_code": "e.g., COMP 2404",
                "start_time": "HH:MM",
                "end_time": "HH:MM",
                "room": "e.g., NN 231"
            }
            Return ONLY the raw JSON data array. No markdown wrappers.
            If you do not detect any text return nothing.
            If you do not detect a schedule return nothing.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                prompt,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: mimeType
                    }
                }
            ],
        });

        const responseText = response.text;
        const cleanJsonText = responseText.replace(/```json|```/g, "").trim();
        const parsedSchedule = JSON.parse(cleanJsonText);

        const structuredByDay = {
            Monday: [], Tuesday: [], Wednesday: [], 
            Thursday: [], Friday: [], Saturday: [], Sunday: []
        };

        parsedSchedule.forEach(item => {
            if (structuredByDay[item.day]) {
                structuredByDay[item.day].push(item);
            } else {
                console.warn(`Unexpected day format found: ${item.day}`);
            }
        });

        res.json({ schedule: structuredByDay });

    } catch (error) {
        console.error("CRITICAL BACKEND ERROR:", error);
        if (error.status === 429) {
            return res.status(429).json({ error: 'System is busy. Please try again in a minute.' });
        }
        res.status(500).json({ error: error.message || 'Failed to accurately parse the timetable image.' });
    }
});

// ==========================================
// 2. GOOGLE AUTH ROUTES
// ==========================================
app.get('/api/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', 
    scope: ['https://www.googleapis.com/auth/calendar.events'],
  });
  res.json({ url });
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    res.redirect('http://127.0.0.1:5500/index.html?auth=success');
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.redirect('http://127.0.0.1:5500/index.html?auth=error');
  }
});

// ==========================================
// 3. GOOGLE CALENDAR EXPORT ROUTE (TIMEZONE INSULATED)
// ==========================================
app.post('/api/create-events', async (req, res) => {
  try {
    const { schedule, termStart, termEnd, breaks } = req.body; 
    
    if (!schedule || !termStart || !termEnd) {
        return res.status(400).json({ error: 'Missing configuration metrics: schedule, termStart, or termEnd.' });
    }

    console.log(`\n--- RECEIVED EXPORT REQUEST ---`);
    console.log(`Raw Frontend Inputs -> Start: ${termStart}, End: ${termEnd}`);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 1. Format termEnd cleanly into the format Google's UNTIL string requires (YYYYMMDDTHHMMSSZ)
    const cleanEndString = termEnd.replace(/-/g, '');
    const semesterEndDate = `${cleanEndString}T235959Z`;

    // 2. Build a dynamic list of exception dates (EXDATE) from the user's custom breaks
    const exceptionDatesList = [];
    (breaks || []).forEach(b => {
        // Splitting by '-' and parsing explicitly keeps JavaScript inside local time execution context
        const [sYear, sMonth, sDay] = b.start.split('-').map(Number);
        const [eYear, eMonth, eDay] = b.end.split('-').map(Number);

        let loopDate = new Date(sYear, sMonth - 1, sDay);
        const stopDate = new Date(eYear, eMonth - 1, eDay);
        
        while (loopDate <= stopDate) {
            const yyyy = loopDate.getFullYear();
            const mm = String(loopDate.getMonth() + 1).padStart(2, '0');
            const dd = String(loopDate.getDate()).padStart(2, '0');
            exceptionDatesList.push(`${yyyy}${mm}${dd}`);
            
            loopDate = new Date(loopDate.getTime() + 24 * 60 * 60 * 1000);
        }
    });

    const flatSchedule = [];
    for (const day in schedule) {
      schedule[day].forEach(item => {
        flatSchedule.push({ ...item, day: day });
      });
    }

    // 3. Dynamically compute the first matching calendar date for each class
    for (const item of flatSchedule) {
      // FIX: Split the string manually to completely bypass the UTC-midnight timezone shifting bug
      const [startYear, startMonth, startDay] = termStart.split('-').map(Number);
      let firstClassDate = new Date(startYear, startMonth - 1, startDay);
      
      const safetyLimit = new Date(firstClassDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      while (DAYS_ORDER[firstClassDate.getDay()] !== item.day && firstClassDate < safetyLimit) {
          firstClassDate = new Date(firstClassDate.getTime() + 24 * 60 * 60 * 1000);
      }

      const yyyy = firstClassDate.getFullYear();
      const mm = String(firstClassDate.getMonth() + 1).padStart(2, '0');
      const dd = String(firstClassDate.getDate()).padStart(2, '0');
      
      const baseDateIso = `${yyyy}-${mm}-${dd}`;
      const startDateTime = `${baseDateIso}T${item.start_time}:00`;
      const endDateTime = `${baseDateIso}T${item.end_time}:00`;

      console.log(`Mapping ${item.course_code}: First Event Date calculated as -> ${startDateTime}`);

      const timeClean = item.start_time.replace(/:/g, '');
      const rruleComponents = [`RRULE:FREQ=WEEKLY;UNTIL=${semesterEndDate}`];
      
      if (exceptionDatesList.length > 0) {
          const formattedExDates = exceptionDatesList.map(dStr => `${dStr}T${timeClean}00`).join(',');
          rruleComponents.push(`EXDATE;TZID=America/Toronto:${formattedExDates}`);
      }

      const event = {
        summary: item.course_code,
        location: item.room || 'TBD',
        description: 'Automatically added by Schedulo',
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Toronto', 
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Toronto',
        },
        recurrence: rruleComponents
      };

      await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });
    }

    res.json({ success: true, message: 'All classes successfully added to your Google Calendar!' });

  } catch (error) {
    console.error('Calendar Error:', error);
    res.status(500).json({ error: 'Failed to add events to Google Calendar.' });
  }
});

app.listen(3000, () => console.log('Server running safely on port 3000'));