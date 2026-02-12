import React, { useState, useEffect } from 'react';
import { supabase } from "./supabaseClient";
import { Calendar, Clock, User, Lock, Plus, X, Edit2, Save, LogOut, Phone, Mail, MessageCircle, ChevronRight, Moon, Sun, Download, Upload, Grid, List } from 'lucide-react';

const TennisScheduler = () => {
  const [view, setView] = useState('client'); // 'client' or 'coach'
  const [session, setSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Supabase Auth session tracking (replaces localStorage password login)
  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data?.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      isMounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // URL slug (e.g. /alex). If present and not found in Supabase -> show Coach Not Found.
  const [coachSlug] = useState(() => window.location.pathname.split('/')[1]?.toLowerCase() || null);
  const [coachNotFound, setCoachNotFound] = useState(false);
  const [coachLoading, setCoachLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [coachData, setCoachData] = useState(null);
  const isCoachAuthed = !!session && !!coachData?.userId && session.user.id === coachData.userId;
  const [schedule, setSchedule] = useState([]);
  const [editingSlot, setEditingSlot] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAddApptModal, setShowAddApptModal] = useState(false);

  // Ensure add-appointment modal never shows outside coach view
  useEffect(() => {
    if (view !== "coach") setShowAddApptModal(false);
  }, [view]);

  const [newAppt, setNewAppt] = useState({
    date: '',
    start: '09:00',
    end: '10:00',
    client_name: '',
    location: '',
    notes: ''
  });
  const [coachViewType, setCoachViewType] = useState('week'); // 'list', 'week', or 'month'
  const [darkMode, setDarkMode] = useState(false); // Dark mode state
  const [showCalendarSync, setShowCalendarSync] = useState(false); // Calendar sync modal
  const [profileTab, setProfileTab] = useState('basic');
  const [newLink, setNewLink] = useState({ title: '', url: '' });
  const [isAddingSlot, setIsAddingSlot] = useState(false); // Prevent double-clicks
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // Delete confirmation modal
  const [slotToDelete, setSlotToDelete] = useState(null); // Track which slot to delete

  // PST timezone offset (-8 hours from UTC, -7 during DST)
  const getPSTDate = (date = new Date()) => {
    // Convert to PST
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    const pstOffset = -8; // PST is UTC-8 (change to -7 for PDT if needed)
    return new Date(utc + (3600000 * pstOffset));
  };

  const formatDatePST = (date) => {
    const pstDate = getPSTDate(date);
    return pstDate.toISOString().split('T')[0];
  };

  const getCurrentPSTTime = () => {
    return getPSTDate();
  };

  // Load data from storage
  useEffect(() => {
    loadData();
    // Load dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
  }, []);

  // Auto-adjust selected week if it's now in the past (client view only)
  useEffect(() => {
    if (view === 'client') {
      const weeks = getWeeksInMonth(currentMonth);
      const today = getCurrentPSTTime();
      const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      // Find first week that hasn't passed
      let firstAvailableWeek = 0;
      for (let i = 0; i < weeks.length; i++) {
        const weekEndDate = new Date(weeks[i][6]); // Saturday
        const weekEndDateOnly = new Date(weekEndDate.getFullYear(), weekEndDate.getMonth(), weekEndDate.getDate());
        const hasWeekPassed = weekEndDateOnly < todayDateOnly;
        
        if (!hasWeekPassed) {
          firstAvailableWeek = i;
          break;
        }
      }
      
      // If selected week has passed, switch to first available
      if (selectedWeekIndex < firstAvailableWeek) {
        setSelectedWeekIndex(firstAvailableWeek);
      }
    }
  }, [view, currentMonth, selectedWeekIndex]);

  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const loadData = async () => {
    // If a slug is in the URL, it must exist in Supabase.
    // This prevents random /something URLs from showing a default coach.
    let coachRow = null;
    try {
      if (coachSlug) {
        const { data, error } = await supabase
          .from('coaches')
          .select('id, slug, display_name, public_note, user_id')
          .eq('slug', coachSlug)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          setCoachNotFound(true);
          setCoachLoading(false);
          return;
        }
        coachRow = data;
        setCoachNotFound(false);
      } else {
        setCoachNotFound(false);
      }
    } catch (e) {
      console.error('Error loading coach by slug:', e);
      // Fail closed: treat as not found if slug present
      if (coachSlug) {
        setCoachNotFound(true);
        setCoachLoading(false);
        return;
      }
    }

    // Try to load saved coach data from localStorage
    const savedCoachData = localStorage.getItem('coachData');
    
    if (savedCoachData) {
      // Load saved data
      setCoachData(JSON.parse(savedCoachData));
    } else {
      // Use default data
      setCoachData({
        name: 'Alex Martinez',
        bio: 'USPTA certified tennis coach with 10+ years of experience. Specializing in junior development and competitive play.',
        profilePic: '🎾',
        password: 'coach123',
        backgroundColor: '#1a472a',
        bannerColor: 'linear-gradient(135deg, #1a472a 0%, #2d5a3d 50%, #1a472a 100%)',
        textColor: '#ffffff',
        accentColor: '#10b981',
        links: []
      });
    }

    // If this page is slug-based, prefer the Supabase coach display name/public note.
    if (coachRow) {
      setCoachData(prev => ({
        ...prev,
        name: coachRow.display_name || prev.name,
        publicNote: coachRow.public_note ?? prev.publicNote,
        coachId: coachRow.id,
        userId: coachRow.user_id,
        slug: coachRow.slug
      }));
    }

    setCoachLoading(false);

    // Schedule is loaded from Supabase (client=public availability, coach=availability+private)
    setLoading(false);
  };

  const rowToSlotFromAvailability = (row) => {
    const start = getPSTDate(new Date(row.start_time));
    const end = getPSTDate(new Date(row.end_time));
    return {
      id: row.id,
      db_table: "availability_slots",
      date: formatDatePST(start),
      startTime: start.getHours() + (start.getMinutes() / 60),
      endTime: end.getHours() + (end.getMinutes() / 60),
      type: row.status === "open" ? "available" : "blocked",
      clientName: "",
      clientPhone: "",
      clientEmail: "",
      court: "",
      notes: ""
    };
  };

  const rowToSlotFromAppointment = (row) => {
    const start = getPSTDate(new Date(row.start_time));
    const end = getPSTDate(new Date(row.end_time));
    return {
      id: row.id,
      db_table: "appointments_private",
      date: formatDatePST(start),
      startTime: start.getHours() + (start.getMinutes() / 60),
      endTime: end.getHours() + (end.getMinutes() / 60),
      type: "booked",
      clientName: row.client_name || "",
      clientPhone: "",
      clientEmail: "",
      court: row.location || "",
      notes: row.notes || ""
    };
  };

  const refreshScheduleFromSupabase = async ({ includePrivate } = {}) => {
    if (!coachData?.coachId) {
      setSchedule([]);
      return;
    }

    try {
      if (!includePrivate) {
        // CLIENT: only open availability
        const { data: availRows, error: availErr } = await supabase
          .from("availability_slots")
          .select("id, start_time, end_time, status")
          .eq("coach_id", coachData.coachId)
          .eq("status", "open")
          .order("start_time", { ascending: true });

        if (availErr) throw availErr;
        setSchedule((availRows || []).map(rowToSlotFromAvailability));
        return;
      }

      // COACH: all availability + private appointments
      const [{ data: availRows, error: availErr }, { data: apptRows, error: apptErr }] = await Promise.all([
        supabase
          .from("availability_slots")
          .select("id, start_time, end_time, status")
          .eq("coach_id", coachData.coachId)
          .order("start_time", { ascending: true }),
        supabase
          .from("appointments_private")
          .select("id, start_time, end_time, client_name, location, notes")
          .eq("coach_id", coachData.coachId)
          .order("start_time", { ascending: true })
      ]);

      if (availErr) throw availErr;
      if (apptErr) throw apptErr;

      const merged = [
        ...(availRows || []).map(rowToSlotFromAvailability),
        ...(apptRows || []).map(rowToSlotFromAppointment)
      ].sort((a, b) => new Date(`${a.date}T${a.startTime}:00:00`) - new Date(`${b.date}T${b.startTime}:00:00`));

      setSchedule(merged);
    } catch (err) {
      console.error("Error refreshing schedule from Supabase:", err);
      // fallback: show cached schedule if available
      try {
        const cached = JSON.parse(localStorage.getItem("schedule_cache") || "null");
        if (Array.isArray(cached)) setSchedule(cached);
      } catch (_) {}
    }
  };

  useEffect(() => {
    // client view = public only; coach view = includePrivate when authenticated
    const includePrivate = view === "coach" && isCoachAuthed;
    refreshScheduleFromSupabase({ includePrivate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachData?.coachId, view, isCoachAuthed]);


  const saveCoachData = (data) => {
    setCoachData(data);
    // Save to localStorage
    localStorage.setItem('coachData', JSON.stringify(data));
  };

  const saveSchedule = (scheduleData) => {
    setSchedule(scheduleData);
    // Optional offline cache only
    try { localStorage.setItem('schedule_cache', JSON.stringify(scheduleData)); } catch (_) {}
  };

  const handleLogin = async () => {
    setAuthError('');
    try {
      const email = (authEmail || '').trim();
      const password = authPassword || '';
      if (!email || !password) {
        setAuthError('Email and password required.');
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const userId = data?.user?.id || data?.session?.user?.id;
      if (!userId) {
        setAuthError('Login failed (no user).');
        return;
      }

      if (coachData?.userId && userId !== coachData.userId) {
        await supabase.auth.signOut();
        setAuthError('This account is not authorized for this coach link.');
        return;
      }

      setShowLoginModal(false);
      setAuthPassword('');
      setView('coach');
      await refreshScheduleFromSupabase(true);
    } catch (e) {
      setAuthError(e?.message || 'Login failed.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setView('client');
  };

  // Get all weeks in the current month
  const getWeeksInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    
    const weeks = [];
    let currentDate = new Date(startDate);
    
    while (currentDate <= lastDay || currentDate.getMonth() === month) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push(week);
      
      if (currentDate.getMonth() !== month && week[6].getMonth() !== month) {
        break;
      }
    }
    
    return weeks;
  };

  const getCurrentWeek = () => {
    const weeks = getWeeksInMonth(currentMonth);
    return weeks[selectedWeekIndex] || weeks[0];
  };

  const formatDate = (date) => {
    return formatDatePST(date);
  };

  const formatTime = (hour) => {
    const wholeHour = Math.floor(hour);
    const minutes = Math.round((hour % 1) * 60);
    const period = wholeHour >= 12 ? 'PM' : 'AM';
    const displayHour = wholeHour % 12 || 12;
    const minuteStr = minutes.toString().padStart(2, '0');
    return `${displayHour}:${minuteStr} ${period}`;
  };

  // Convert decimal hour (e.g., 15.5) to HH:MM format (e.g., "15:30")
  const decimalToTimeString = (decimalHour) => {
    const hours = Math.floor(decimalHour);
    const minutes = Math.round((decimalHour % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Convert HH:MM format (e.g., "15:30") to decimal hour (e.g., 15.5)
  const timeStringToDecimal = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours + (minutes / 60);
  };

  
  const pad2 = (n) => String(n).padStart(2, "0");

  const slotToISO = (dateStr, hourFloat) => {
    const hour = Math.floor(hourFloat);
    const minute = Math.round((hourFloat % 1) * 60);
    const d = new Date(`${dateStr}T${pad2(hour)}:${pad2(minute)}:00`);
    return d.toISOString();
  };

  
  const createAppointmentFromModal = async () => {
    console.log('createAppointmentFromModal called');
    console.log('coachData:', coachData);
    console.log('isCoachAuthed:', isCoachAuthed);
    console.log('newAppt:', newAppt);

    if (!coachData?.coachId) {
      alert('Error: Coach ID not found. Please reload the page.');
      console.error('Missing coachId in coachData');
      return;
    }
    
    if (!isCoachAuthed) {
      alert('Please log in as this coach first.');
      setAuthError('Please log in as this coach first.');
      return;
    }

    try {
      const date = newAppt.date;
      if (!date) {
        alert('Please select a date.');
        return;
      }

      // Parse the time strings to get hours and minutes
      const [startHour, startMin] = newAppt.start.split(':').map(Number);
      const [endHour, endMin] = newAppt.end.split(':').map(Number);
      
      // Create dates in PST by parsing the date string and adding time
      const [year, month, day] = date.split('-').map(Number);
      
      // Create PST dates (month is 0-indexed)
      const startDate = new Date(year, month - 1, day, startHour, startMin, 0);
      const endDate = new Date(year, month - 1, day, endHour, endMin, 0);
      
      // Convert to ISO strings
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      console.log('Creating appointment:', {
        coach_id: coachData.coachId,
        date: date,
        start_time_local: `${newAppt.start}`,
        end_time_local: `${newAppt.end}`,
        start_time_iso: startISO,
        end_time_iso: endISO,
        client_name: newAppt.client_name || null,
        location: newAppt.location || null
      });

      if (endDate <= startDate) {
        alert('End time must be after start time.');
        return;
      }

      const { data, error } = await supabase.from('appointments_private').insert([{
        coach_id: coachData.coachId,
        start_time: startISO,
        end_time: endISO,
        client_name: newAppt.client_name || null,
        location: newAppt.location || null,
        notes: newAppt.notes || ''
      }]).select();

      if (error) throw error;

      console.log('Appointment created successfully:', data);
      alert('Appointment created successfully!');

      setShowAddApptModal(false);
      setNewAppt({ date: '', start: '09:00', end: '10:00', client_name: '', location: '', notes: '' });
      await refreshScheduleFromSupabase({ includePrivate: true });
    } catch (e) {
      console.error('Error creating appointment:', e);
      alert(`Failed to create appointment: ${e?.message || 'Unknown error'}`);
    }
  };

const addTimeSlot = async () => {
    if (isAddingSlot) return;
    if (!isCoachAuthed || view !== 'coach' || !coachData?.coachId) {
      alert('Coach login required');
      return;
    }
    setIsAddingSlot(true);

    // Create a default 1-hour appointment
    const dateStr = formatDate(getCurrentPSTTime());
    const startHour = 9;
    const endHour = 10;

    try {
      const { error } = await supabase.from('appointments_private').insert([{
        coach_id: coachData.coachId,
        start_time: slotToISO(dateStr, startHour),
        end_time: slotToISO(dateStr, endHour),
        client_name: '',
        location: '',
        notes: ''
      }]);
      if (error) throw error;
      await refreshScheduleFromSupabase({ includePrivate: true });
    } catch (err) {
      console.error('Error adding slot:', err);
      alert('Failed to add slot (Supabase). Check console.');
    } finally {
      setIsAddingSlot(false);
    }
  };

  const updateTimeSlot = async (id, updates) => {
    const slot = schedule.find(s => s.id === id);
    if (!slot) return;

    // Client view should never write; just update UI state if needed
    if (!isCoachAuthed || view !== 'coach' || !coachData?.coachId) {
      setSchedule(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      return;
    }

    const next = { ...slot, ...updates };

    try {
      if (slot.db_table === 'availability_slots') {
        const status = next.type === 'available' ? 'open' : 'closed';
        const { error } = await supabase
          .from('availability_slots')
          .update({
            start_time: slotToISO(next.date, next.startTime),
            end_time: slotToISO(next.date, next.endTime),
            status
          })
          .eq('id', slot.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('appointments_private')
          .update({
            start_time: slotToISO(next.date, next.startTime),
            end_time: slotToISO(next.date, next.endTime),
            client_name: next.clientName || '',
            location: next.court || '',
            notes: next.notes || ''
          })
          .eq('id', slot.id);
        if (error) throw error;
      }

      await refreshScheduleFromSupabase({ includePrivate: true });
    } catch (err) {
      console.error('Error updating slot:', err);
      alert('Failed to update slot (Supabase). Check console.');
    }
  };

  const deleteTimeSlot = async (id) => {
    const slot = schedule.find(s => s.id === id);
    if (!slot) return;

    if (!isCoachAuthed || view !== 'coach') {
      alert('Coach login required');
      return;
    }

    try {
      if (slot.db_table === 'availability_slots') {
        const { error } = await supabase.from('availability_slots').delete().eq('id', slot.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('appointments_private').delete().eq('id', slot.id);
        if (error) throw error;
      }

      setEditingSlot(null);
      await refreshScheduleFromSupabase({ includePrivate: true });
    } catch (err) {
      console.error('Error deleting slot:', err);
      alert('Failed to delete slot (Supabase). Check console.');
    }
  };


  const removeDuplicates = () => {
    const seen = new Set();
    const uniqueSchedule = schedule.filter(slot => {
      const key = `${slot.date}-${slot.startTime}-${slot.endTime}-${slot.clientName}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    saveSchedule(uniqueSchedule);
  };

  const getSlotsByDate = (date) => {
    const dateStr = formatDate(date);
    return schedule.filter(slot => slot.date === dateStr).sort((a, b) => a.startTime - b.startTime);
  };

  // Import from Google Calendar (ICS format)
  const handleCalendarImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const icsData = e.target.result;
      const importedSlots = parseICSFile(icsData);
      
      if (importedSlots.length > 0) {
        const mergedSchedule = [...schedule, ...importedSlots];
        saveSchedule(mergedSchedule);
        alert(`Successfully imported ${importedSlots.length} events!`);
        setShowCalendarSync(false);
      } else {
        alert('No events found in the calendar file.');
      }
    };
    reader.readAsText(file);
  };

  // Parse ICS file format
  const parseICSFile = (icsContent) => {
    const slots = [];
    const events = icsContent.split('BEGIN:VEVENT');
    
    events.slice(1).forEach(event => {
      try {
        const summaryMatch = event.match(/SUMMARY:(.*)/);
        const dtStartMatch = event.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/);
        const dtEndMatch = event.match(/DTEND[^:]*:(\d{8}T\d{6}Z?)/);
        const descriptionMatch = event.match(/DESCRIPTION:(.*)/);
        
        if (dtStartMatch && dtEndMatch) {
          const startDateTime = parseICSDateTime(dtStartMatch[1]);
          const endDateTime = parseICSDateTime(dtEndMatch[1]);
          
          const slot = {
            id: Date.now() + Math.random(),
            date: formatDate(startDateTime),
            startTime: startDateTime.getHours() + (startDateTime.getMinutes() / 60),
            endTime: endDateTime.getHours() + (endDateTime.getMinutes() / 60),
            type: 'booked',
            clientName: summaryMatch ? summaryMatch[1].replace(/\\n/g, ' ').trim() : 'Imported Event',
            clientPhone: '',
            clientEmail: '',
            court: '',
            notes: descriptionMatch ? descriptionMatch[1].replace(/\\n/g, ' ').trim() : 'Imported from calendar'
          };
          
          slots.push(slot);
        }
      } catch (error) {
        console.error('Error parsing event:', error);
      }
    });
    
    return slots;
  };

  // Parse ICS datetime format (20240215T140000Z)
  const parseICSDateTime = (icsDateTime) => {
    const year = parseInt(icsDateTime.substr(0, 4));
    const month = parseInt(icsDateTime.substr(4, 2)) - 1;
    const day = parseInt(icsDateTime.substr(6, 2));
    const hour = parseInt(icsDateTime.substr(9, 2));
    const minute = parseInt(icsDateTime.substr(11, 2));
    
    const date = new Date(Date.UTC(year, month, day, hour, minute));
    return getPSTDate(date);
  };

  const timeSlots = Array.from({ length: 33 }, (_, i) => 6 + (i * 0.5)); // 6 AM to 10 PM in 30-min increments

  // FULL MONTH CALENDAR VIEW for Coach
  const renderMonthCalendar = () => {
    const weeks = getWeeksInMonth(currentMonth);
    const today = getCurrentPSTTime();
    
    return (
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-6`}>
        <div className="grid grid-cols-7 gap-2 mb-4">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className={`text-center font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'} text-sm py-2`}>
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-2">
          {weeks.map((week, weekIdx) => (
            week.map((date, dayIdx) => {
              const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
              const isToday = date.toDateString() === today.toDateString();
              const slots = getSlotsByDate(date);
              const bookedSlots = slots.filter(s => s.type === 'booked');
              const blockedSlots = slots.filter(s => s.type === 'blocked');
              
              return (
                <div
                  key={`${weekIdx}-${dayIdx}`}
                  className={`min-h-[120px] p-2 rounded-lg border-2 transition-all cursor-pointer
                    ${isCurrentMonth 
                      ? darkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-500' : 'bg-white border-gray-200 hover:border-blue-400'
                      : darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-100'
                    }
                    ${isToday ? 'ring-2 ring-blue-500' : ''}
                  `}
                  onClick={() => setExpandedDate(expandedDate === formatDate(date) ? null : formatDate(date))}
                >
                  <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-blue-600' : isCurrentMonth ? (darkMode ? 'text-gray-200' : 'text-gray-700') : (darkMode ? 'text-gray-600' : 'text-gray-400')}`}>
                    {date.getDate()}
                  </div>
                  
                  <div className="space-y-1">
                    {bookedSlots.slice(0, 2).map(slot => (
                      <div key={slot.id} className="bg-green-500 text-white text-xs px-2 py-1 rounded truncate">
                        {formatTime(slot.startTime)} {slot.clientName || 'Booked'}
                      </div>
                    ))}
                    {blockedSlots.slice(0, 2).map(slot => (
                      <div key={slot.id} className="bg-gray-400 text-white text-xs px-2 py-1 rounded truncate">
                        {formatTime(slot.startTime)} Blocked
                      </div>
                    ))}
                    {slots.length > 2 && (
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} text-center`}>
                        +{slots.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ))}
        </div>
      </div>
    );
  };

  // WEEKLY VIEW for Coach
  const renderWeekView = () => {
    const week = getCurrentWeek();
    const today = getCurrentPSTTime();
    
    return (
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg overflow-hidden`}>
        <div className="grid grid-cols-8">
          {/* Time column */}
          <div className={`${darkMode ? 'bg-gray-900' : 'bg-gray-50'} p-4`}>
            <div className="h-16"></div>
            {timeSlots.map(hour => (
              <div key={hour} className="h-8 flex items-center justify-end pr-2">
                {hour % 1 === 0 && ( // Only show labels on the hour
                  <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{formatTime(hour)}</span>
                )}
              </div>
            ))}
          </div>
          
          {/* Day columns */}
          {week.map((date, idx) => {
            const isToday = date.toDateString() === today.toDateString();
            const slots = getSlotsByDate(date);
            
            return (
              <div key={idx} className={`border-l ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                {/* Day header */}
                <div className={`h-16 p-2 text-center border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'} ${isToday ? 'bg-blue-50 dark:bg-blue-900' : ''}`}>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className={`text-lg font-bold ${isToday ? 'text-blue-600' : darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    {date.getDate()}
                  </div>
                </div>
                
                {/* Time slots */}
                <div className="relative">
                  {timeSlots.map(hour => (
                    <div key={hour} className={`h-8 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>
                  ))}
                  
                  {/* Scheduled events */}
                  {slots.map(slot => {
                    const top = (slot.startTime - 6) * 64; // 64px per hour (2 x 32px slots)
                    const height = (slot.endTime - slot.startTime) * 64;
                    
                    return (
                      <div
                        key={slot.id}
                        className={`absolute left-1 right-1 rounded-lg p-2 cursor-pointer ${
                          slot.type === 'booked' 
                            ? 'bg-green-500 hover:bg-green-600' 
                            : 'bg-gray-400 hover:bg-gray-500'
                        } text-white overflow-hidden`}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onClick={() => setEditingSlot(slot.id)}
                      >
                        <div className="text-xs font-semibold truncate">
                          {slot.clientName || (slot.type === 'blocked' ? 'Blocked' : 'Available')}
                        </div>
                        <div className="text-xs opacity-90">
                          {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">🎾</div>
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  
  // Slug-based 404 handling
  
  // If there's no slug in the URL ("/"), do not render the app/template.
  if (!coachSlug) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
        <div className="max-w-md w-full p-6">
          <div className="text-3xl font-bold mb-2">Coach link required</div>
          <div className="text-sm opacity-80 mb-6">
            Please open a coach-specific link like <span className="font-mono">/thomas</span>.
          </div>
          <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
            <div className="text-sm mb-2 opacity-80">Example:</div>
            <div className="font-mono text-sm break-all">
              {window.location.origin}/thomas
            </div>
          </div>
        </div>
      </div>
    );
  }

if (coachLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">Loading…</div>
          <div className="opacity-75">Checking coach profile</div>
        </div>
      </div>
    );
  }

  if (coachNotFound) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
        <div className="max-w-md w-full p-6">
          <div className="text-5xl font-extrabold mb-3">404</div>
          <div className="text-xl font-bold mb-2">Coach not found</div>
          <p className="opacity-80 mb-6">No coach is registered for <span className="font-mono">/{coachSlug || ''}</span>.</p>
          <button
            onClick={() => { window.location.href = '/'; }}
            className={`w-full py-2.5 rounded-lg font-semibold ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100 border border-gray-200'}`}
          >
            Go to home
          </button>
        </div>
      </div>
    );
  }

// CLIENT VIEW
  if (view === 'client') {
    const week = getCurrentWeek();
    const today = getCurrentPSTTime();
    
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-gray-100'} transition-colors duration-200`}>
        {/* Header */}
        <div 
          className="py-8 px-6"
          style={{ 
            background: darkMode ? 'linear-gradient(135deg, #1f2937 0%, #374151 100%)' : coachData.bannerColor,
            color: coachData.textColor 
          }}
        >
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-6xl">{coachData.profilePic}</div>
                <div>
                  <h1 className="text-4xl font-bold mb-1">{coachData.name}</h1>
                  <p className="text-lg opacity-90">{coachData.bio}</p>
                </div>
              </div>
              
              {/* Dark Mode Toggle & Coach Login */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`p-3 rounded-full transition-all ${
                    darkMode 
                      ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' 
                      : 'bg-gray-700 hover:bg-gray-800 text-white'
                  }`}
                  title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {darkMode ? <Sun size={24} /> : <Moon size={24} />}
                </button>
                
                <button
                  onClick={() => setShowLoginModal(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    darkMode 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  <Lock size={18} />
                  Coach Login
                </button>
              </div>
            </div>
            
            {/* Links */}
            {coachData.links && coachData.links.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {coachData.links.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                  >
                    {link.title}
                    <ChevronRight size={14} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Calendar */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            {/* Empty div for spacing (no Previous button in client view) */}
            <div className="w-24"></div>
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                darkMode 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
              }`}
            >
              Next →
            </button>
          </div>

          {/* Week Selector - Only show current and future weeks */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {getWeeksInMonth(currentMonth).map((week, idx) => {
              // Check if ALL days in this week have passed
              const today = getCurrentPSTTime();
              const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              
              // Get the last day of the week (Saturday)
              const weekEndDate = new Date(week[6]);
              const weekEndDateOnly = new Date(weekEndDate.getFullYear(), weekEndDate.getMonth(), weekEndDate.getDate());
              
              // Week has passed if Saturday is before today
              const hasWeekPassed = weekEndDateOnly < todayDateOnly;
              
              // Don't render past weeks
              if (hasWeekPassed) return null;
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedWeekIndex(idx)}
                  className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                    selectedWeekIndex === idx
                      ? darkMode
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-500 text-white'
                      : darkMode
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
                  }`}
                >
                  Week {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Week View - Time Grid Layout */}
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-xl overflow-hidden`}>
            {/* Day Headers */}
            <div className="grid grid-cols-8">
              {/* Empty corner cell for time labels */}
              <div className={`${darkMode ? 'bg-gray-900' : 'bg-gray-50'} p-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="text-xs text-center font-medium opacity-50">Time</div>
              </div>
              
              {/* Day headers */}
              {week.map((date, idx) => {
                const isToday = date.toDateString() === today.toDateString();
                return (
                  <div 
                    key={idx} 
                    className={`p-3 text-center border-l border-b ${
                      darkMode ? 'border-gray-700' : 'border-gray-200'
                    } ${isToday ? (darkMode ? 'bg-blue-900' : 'bg-blue-50') : ''}`}
                  >
                    <div className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className={`text-lg font-bold mt-0.5 ${
                      isToday ? 'text-blue-600' : darkMode ? 'text-gray-200' : 'text-gray-800'
                    }`}>
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time Grid */}
            <div className="grid grid-cols-8">
              {/* Time labels column */}
              <div className={`${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                {timeSlots.map(hour => (
                  <div key={hour} className={`h-7 flex items-center justify-end pr-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    {hour % 1 === 0 && ( // Only show labels on the hour
                      <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {formatTime(hour)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Day columns with time slots */}
              {week.map((date, dayIdx) => {
                const isToday = date.toDateString() === today.toDateString();
                const slots = getSlotsByDate(date);
                
                return (
                  <div key={dayIdx} className={`border-l ${darkMode ? 'border-gray-700' : 'border-gray-200'} relative`}>
                    {/* Hour cells */}
                    {timeSlots.map((hour, hourIdx) => {
                      // Check if this time slot overlaps with any appointment
                      const slotStart = hour;
                      const slotEnd = hour + 0.5;
                      const hourSlots = slots.filter(slot => 
                        (slot.startTime < slotEnd && slot.endTime > slotStart)
                      );
                      const hasSlot = hourSlots.length > 0;
                      const slot = hourSlots[0]; // Take first slot if multiple
                      const isSlotStart = hasSlot && Math.abs(slot.startTime - hour) < 0.01; // Check if this is the start cell
                      
                      return (
                        <div
                          key={hour}
                          className={`h-7 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'} transition-colors ${
                            !hasSlot 
                              ? darkMode
                                ? 'bg-gray-800 hover:bg-gray-750'
                                : 'bg-white hover:bg-green-50'
                              : slot.type === 'booked'
                                ? darkMode
                                  ? 'bg-red-900/50'
                                  : 'bg-red-50'
                                : darkMode
                                  ? 'bg-gray-700'
                                  : 'bg-gray-200'
                          }`}
                        >
                          {hasSlot && isSlotStart && (
                            <div className={`h-full flex items-center justify-center px-1`}>
                              <div className={`text-center ${
                                slot.type === 'booked'
                                  ? darkMode ? 'text-red-300' : 'text-red-700'
                                  : darkMode ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                <div className="text-xs font-semibold leading-tight">
                                  {slot.type === 'booked' ? 'Booked' : 'Blocked'}
                                </div>
                                <div className="text-[10px] opacity-75 mt-0.5">
                                  {formatTime(slot.startTime)}-{formatTime(slot.endTime)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className={`mt-4 flex items-center justify-center gap-6 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${darkMode ? 'bg-gray-800 border border-gray-600' : 'bg-white border border-gray-300'}`}></div>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${darkMode ? 'bg-red-900/50' : 'bg-red-50'}`}></div>
              <span>Booked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
              <span>Blocked</span>
            </div>
          </div>

          {/* PST Timezone Notice */}
          <div className={`mt-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            All times shown in Pacific Standard Time (PST)
          </div>
        </div>

        {/* Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLoginModal(false)}>
            <div 
              className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl`}
              onClick={e => e.stopPropagation()}
            >
              <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Coach Login
              </h2>
              <input
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3"
                />
                <input
                type="password"
                placeholder="Enter password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                className={`w-full px-4 py-3 rounded-lg mb-4 ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-800'
                } border-2 focus:border-blue-500 focus:outline-none`}
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={handleLogin}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-all"
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    setShowLoginModal(false);
                    setAuthPassword('');
                  }}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    darkMode 
                      ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      {view === 'coach' && showAddApptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Add Appointment</h2>
              <button
                onClick={() => setShowAddApptModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="date"
                value={newAppt.date}
                onChange={(e) => setNewAppt(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="time"
                  value={newAppt.start}
                  onChange={(e) => setNewAppt(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl"
                />
                <input
                  type="time"
                  value={newAppt.end}
                  onChange={(e) => setNewAppt(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl"
                />
              </div>
              <input
                type="text"
                placeholder="Client name (optional)"
                value={newAppt.client_name}
                onChange={(e) => setNewAppt(prev => ({ ...prev, client_name: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl"
              />
              <input
                type="text"
                placeholder="Location (optional)"
                value={newAppt.location}
                onChange={(e) => setNewAppt(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl"
              />
              <textarea
                placeholder="Notes (optional)"
                value={newAppt.notes}
                onChange={(e) => setNewAppt(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl"
                rows={3}
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddApptModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createAppointmentFromModal}
                className="flex-1 px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  }

  // COACH VIEW
  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} transition-colors duration-200`}>
      {/* Header */}
      <div 
        className="py-6 px-6 shadow-lg"
        style={{ 
          background: darkMode ? 'linear-gradient(135deg, #1f2937 0%, #374151 100%)' : coachData.bannerColor,
          color: coachData.textColor 
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-3xl font-bold">Coach Dashboard</h1>
          <div className="flex items-center gap-4">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-all ${
                darkMode 
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' 
                  : 'bg-gray-700 hover:bg-gray-800 text-white'
              }`}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            {/* Calendar Sync Button */}
            <button
              onClick={() => setShowCalendarSync(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-all"
            >
              <Upload size={18} />
              Import Calendar
            </button>
            
            {/* Edit Profile Button */}
            <button
              onClick={() => setIsEditingProfile(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all"
            >
              <Edit2 size={18} />
              Edit Profile
            </button>
            
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-medium transition-all"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setCoachViewType('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                coachViewType === 'list'
                  ? 'bg-blue-600 text-white'
                  : darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
              }`}
            >
              <List size={18} />
              List View
            </button>
            <button
              onClick={() => setCoachViewType('week')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                coachViewType === 'week'
                  ? 'bg-blue-600 text-white'
                  : darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
              }`}
            >
              <Calendar size={18} />
              Week View
            </button>
            <button
              onClick={() => setCoachViewType('month')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                coachViewType === 'month'
                  ? 'bg-blue-600 text-white'
                  : darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
              }`}
            >
              <Grid size={18} />
              Month View
            </button>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddApptModal(true)}
              disabled={isAddingSlot}
              className={`flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg transition-all ${
                isAddingSlot ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Plus size={20} />
              Add Appointment
            </button>
            
            {schedule.length > 0 && (
              <button
                onClick={removeDuplicates}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  darkMode 
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                    : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                }`}
                title="Remove duplicate appointments"
              >
                <X size={20} />
                Clean Up
              </button>
            )}
          </div>
        </div>

        {/* Month Navigation (for month and week views) */}
        {coachViewType !== 'list' && (
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                darkMode 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
              }`}
            >
              ← Previous Month
            </button>
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                darkMode 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
              }`}
            >
              Next Month →
            </button>
          </div>
        )}

        {/* Week Selector (for week view only) */}
        {coachViewType === 'week' && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {getWeeksInMonth(currentMonth).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedWeekIndex(idx)}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                  selectedWeekIndex === idx
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      : 'bg-white hover:bg-gray-50 text-gray-700 shadow-sm'
                }`}
              >
                Week {idx + 1}
              </button>
            ))}
          </div>
        )}

        {/* Render appropriate view */}
        {coachViewType === 'month' && renderMonthCalendar()}
        {coachViewType === 'week' && renderWeekView()}
        {coachViewType === 'list' && (
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-6`}>
            <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              All Appointments
            </h3>
            <div className="space-y-3">
              {schedule.length === 0 ? (
                <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  No appointments scheduled
                </div>
              ) : (
                schedule
                  .sort((a, b) => new Date(a.date) - new Date(b.date) || a.startTime - b.startTime)
                  .map(slot => (
                    <div
                      key={slot.id}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        slot.type === 'booked'
                          ? darkMode
                            ? 'bg-green-900 border-green-700 hover:border-green-500'
                            : 'bg-green-50 border-green-200 hover:border-green-400'
                          : darkMode
                            ? 'bg-gray-700 border-gray-600 hover:border-gray-500'
                            : 'bg-gray-50 border-gray-300 hover:border-gray-400'
                      }`}
                      onClick={() => setEditingSlot(slot.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                            {slot.clientName || (slot.type === 'blocked' ? 'Blocked Time' : 'Open Slot')}
                          </div>
                          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {new Date(slot.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                          </div>
                        </div>
                        <Edit2 size={18} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* PST Timezone Notice */}
        <div className={`mt-4 text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          All times shown in Pacific Standard Time (PST)
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsEditingProfile(false)}>
          <div 
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 max-w-lg w-full shadow-2xl max-h-[80vh] overflow-y-auto`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Edit Profile
              </h2>
              <button
                onClick={() => setIsEditingProfile(false)}
                className={`p-1 rounded-lg transition-all ${
                  darkMode 
                    ? 'hover:bg-gray-700 text-gray-400' 
                    : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Coach Name */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Coach Name
                </label>
                <input
                  type="text"
                  value={coachData.name}
                  onChange={(e) => setCoachData({...coachData, name: e.target.value})}
                  placeholder="Alex Martinez"
                  className={`w-full px-3 py-2 rounded-lg text-sm ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                  } border-2 focus:border-blue-500 focus:outline-none`}
                />
              </div>

              {/* Bio */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Bio
                </label>
                <textarea
                  value={coachData.bio}
                  onChange={(e) => setCoachData({...coachData, bio: e.target.value})}
                  placeholder="USPTA certified tennis coach with 10+ years of experience..."
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg text-sm ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                  } border-2 focus:border-blue-500 focus:outline-none resize-none`}
                />
              </div>

              {/* Profile Emoji */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Profile Emoji
                </label>
                <input
                  type="text"
                  value={coachData.profilePic}
                  onChange={(e) => setCoachData({...coachData, profilePic: e.target.value})}
                  placeholder="🎾"
                  maxLength={2}
                  className={`w-full px-3 py-2 rounded-lg text-sm ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                  } border-2 focus:border-blue-500 focus:outline-none`}
                />
              </div>

              {/* Password */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Password
                </label>
                <input
                  type="password"
                  value={coachData.password}
                  onChange={(e) => setCoachData({...coachData, password: e.target.value})}
                  placeholder="Enter new password"
                  className={`w-full px-3 py-2 rounded-lg text-sm ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                  } border-2 focus:border-blue-500 focus:outline-none`}
                />
                <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Leave blank to keep current password
                </p>
              </div>

              {/* Links Section */}
              <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-3 border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                <h3 className={`font-medium mb-2 text-sm ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  Social & Contact Links
                </h3>
                
                {/* Add New Link */}
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Link Title (e.g., Instagram)"
                    value={newLink.title}
                    onChange={(e) => setNewLink({...newLink, title: e.target.value})}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      darkMode 
                        ? 'bg-gray-600 border-gray-500 text-white' 
                        : 'bg-white border-gray-300 text-gray-800'
                    } border-2 focus:border-blue-500 focus:outline-none`}
                  />
                  <input
                    type="url"
                    placeholder="https://..."
                    value={newLink.url}
                    onChange={(e) => setNewLink({...newLink, url: e.target.value})}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      darkMode 
                        ? 'bg-gray-600 border-gray-500 text-white' 
                        : 'bg-white border-gray-300 text-gray-800'
                    } border-2 focus:border-blue-500 focus:outline-none`}
                  />
                  <button
                    onClick={() => {
                      if (newLink.title && newLink.url) {
                        setCoachData({
                          ...coachData,
                          links: [...(coachData.links || []), newLink]
                        });
                        setNewLink({ title: '', url: '' });
                      } else {
                        alert('Please enter both title and URL');
                      }
                    }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-all"
                  >
                    Add
                  </button>
                </div>

                {/* Existing Links */}
                <div className="space-y-2">
                  {(coachData.links || []).map((link, index) => (
                    <div key={index} className={`flex items-center gap-2 p-2 rounded-lg ${darkMode ? 'bg-gray-600' : 'bg-white'} border ${darkMode ? 'border-gray-500' : 'border-gray-200'}`}>
                      <a 
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
                      >
                        <div className={`font-medium text-sm ${darkMode ? 'text-blue-400' : 'text-blue-600'} flex items-center gap-1`}>
                          {link.title}
                          <ChevronRight size={12} />
                        </div>
                        <div className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{link.url}</div>
                      </a>
                      <button
                        onClick={() => {
                          const newLinks = [...coachData.links];
                          newLinks.splice(index, 1);
                          const updatedData = {...coachData, links: newLinks};
                          setCoachData(updatedData);
                          saveCoachData(updatedData); // Persist to localStorage
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-all flex-shrink-0"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {(!coachData.links || coachData.links.length === 0) && (
                    <p className={`text-center py-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      No links added yet
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-3">
                <button
                  onClick={() => {
                    saveCoachData(coachData);
                    setIsEditingProfile(false);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all text-sm"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setIsEditingProfile(false)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                    darkMode 
                      ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Sync Modal */}
      {showCalendarSync && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCalendarSync(false)}>
          <div 
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-8 max-w-2xl w-full mx-4 shadow-2xl`}
            onClick={e => e.stopPropagation()}
          >
            <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              Import from Google Calendar
            </h2>
            
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-blue-50'} border-2 ${darkMode ? 'border-gray-600' : 'border-blue-200'} rounded-lg p-6 mb-6`}>
              <h3 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                📅 How to Export from Google Calendar:
              </h3>
              <ol className={`text-sm space-y-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>1. Open Google Calendar on your computer</li>
                <li>2. Click the ⚙️ Settings icon (top right)</li>
                <li>3. Select "Settings" from the dropdown</li>
                <li>4. Click "Import & Export" in the left sidebar</li>
                <li>5. Click "Export" - this downloads all your calendars as a .zip file</li>
                <li>6. Unzip the file and find the calendar you want (it's a .ics file)</li>
                <li>7. Upload that .ics file below</li>
              </ol>
            </div>

            <div className="mb-6">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Select Calendar File (.ics)
              </label>
              <input
                type="file"
                accept=".ics"
                onChange={handleCalendarImport}
                className={`w-full px-4 py-3 rounded-lg ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-800'
                } border-2 focus:border-purple-500 focus:outline-none`}
              />
            </div>

            <div className={`${darkMode ? 'bg-gray-700' : 'bg-yellow-50'} border-2 ${darkMode ? 'border-gray-600' : 'border-yellow-200'} rounded-lg p-4 mb-6`}>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <strong>⚠️ Note:</strong> Imported events will be added as "Booked" appointments. You can edit them individually after import.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCalendarSync(false)}
                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-all ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Slot Modal */}
      {editingSlot && schedule.find(s => s.id === editingSlot) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingSlot(null)}>
          <div 
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-6 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto`}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const slot = schedule.find(s => s.id === editingSlot);
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                      Edit Appointment
                    </h2>
                    <button
                      onClick={() => setEditingSlot(null)}
                      className={`p-1.5 rounded-lg transition-all ${
                        darkMode 
                          ? 'hover:bg-gray-700 text-gray-400' 
                          : 'hover:bg-gray-100 text-gray-500'
                      }`}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Type
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => updateTimeSlot(slot.id, { type: 'booked' })}
                          className={`py-2 px-3 rounded-lg font-medium transition-all text-sm ${
                            slot.type === 'booked'
                              ? 'bg-green-600 text-white'
                              : darkMode
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          Booked
                        </button>
                        <button
                          onClick={() => updateTimeSlot(slot.id, { type: 'blocked' })}
                          className={`py-2 px-3 rounded-lg font-medium transition-all text-sm ${
                            slot.type === 'blocked'
                              ? 'bg-gray-600 text-white'
                              : darkMode
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          Blocked
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Date
                      </label>
                      <input
                        type="date"
                        value={slot.date}
                        onChange={(e) => updateTimeSlot(slot.id, { date: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg text-sm ${
                          darkMode 
                            ? 'bg-gray-700 border-gray-600 text-white' 
                            : 'bg-white border-gray-300 text-gray-800'
                        } border-2 focus:border-blue-500 focus:outline-none`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={decimalToTimeString(slot.startTime)}
                          onChange={(e) => updateTimeSlot(slot.id, { startTime: timeStringToDecimal(e.target.value) })}
                          className={`w-full px-3 py-2 rounded-lg text-sm ${
                            darkMode 
                              ? 'bg-gray-700 border-gray-600 text-white' 
                              : 'bg-white border-gray-300 text-gray-800'
                          } border-2 focus:border-blue-500 focus:outline-none`}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          End Time
                        </label>
                        <input
                          type="time"
                          value={decimalToTimeString(slot.endTime)}
                          onChange={(e) => updateTimeSlot(slot.id, { endTime: timeStringToDecimal(e.target.value) })}
                          className={`w-full px-3 py-2 rounded-lg text-sm ${
                            darkMode 
                              ? 'bg-gray-700 border-gray-600 text-white' 
                              : 'bg-white border-gray-300 text-gray-800'
                          } border-2 focus:border-blue-500 focus:outline-none`}
                        />
                      </div>
                    </div>

                    {slot.type === 'booked' && (
                      <>
                        <div>
                          <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Client Name
                          </label>
                          <input
                            type="text"
                            value={slot.clientName}
                            onChange={(e) => updateTimeSlot(slot.id, { clientName: e.target.value })}
                            placeholder="John Doe"
                            className={`w-full px-3 py-2 rounded-lg text-sm ${
                              darkMode 
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                            } border-2 focus:border-blue-500 focus:outline-none`}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              Phone
                            </label>
                            <input
                              type="tel"
                              value={slot.clientPhone}
                              onChange={(e) => updateTimeSlot(slot.id, { clientPhone: e.target.value })}
                              placeholder="(555) 123-4567"
                              className={`w-full px-3 py-2 rounded-lg text-sm ${
                                darkMode 
                                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                  : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                              } border-2 focus:border-blue-500 focus:outline-none`}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              Email
                            </label>
                            <input
                              type="email"
                              value={slot.clientEmail}
                              onChange={(e) => updateTimeSlot(slot.id, { clientEmail: e.target.value })}
                              placeholder="john@email.com"
                              className={`w-full px-3 py-2 rounded-lg text-sm ${
                                darkMode 
                                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                  : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                              } border-2 focus:border-blue-500 focus:outline-none`}
                            />
                          </div>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Court
                          </label>
                          <input
                            type="text"
                            value={slot.court}
                            onChange={(e) => updateTimeSlot(slot.id, { court: e.target.value })}
                            placeholder="Court 1"
                            className={`w-full px-3 py-2 rounded-lg text-sm ${
                              darkMode 
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                            } border-2 focus:border-blue-500 focus:outline-none`}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Notes
                          </label>
                          <textarea
                            value={slot.notes}
                            onChange={(e) => updateTimeSlot(slot.id, { notes: e.target.value })}
                            placeholder="Any additional notes..."
                            rows={2}
                            className={`w-full px-3 py-2 rounded-lg text-sm ${
                              darkMode 
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                            } border-2 focus:border-blue-500 focus:outline-none resize-none`}
                          />
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-3">
                      <button
                        onClick={() => setEditingSlot(null)}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all text-sm"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => {
                          console.log('Delete button clicked for slot:', slot);
                          setSlotToDelete(slot.id);
                          setShowDeleteConfirm(true);
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]" onClick={() => setShowDeleteConfirm(false)}>
          <div 
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl border-4 ${darkMode ? 'border-red-500' : 'border-red-400'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <X size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Delete Appointment?
              </h3>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                This action cannot be undone. The appointment will be permanently removed from your schedule.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSlotToDelete(null);
                }}
                className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  console.log('User confirmed delete via custom modal');
                  deleteTimeSlot(slotToDelete);
                  setShowDeleteConfirm(false);
                  setSlotToDelete(null);
                }}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Appointment Modal */}
      {showAddApptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowAddApptModal(false)}>
          <div 
            className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-2xl p-8 max-w-md w-full shadow-xl`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>Add Appointment</h2>
              <button
                onClick={() => setShowAddApptModal(false)}
                className={`text-2xl ${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="date"
                value={newAppt.date}
                onChange={(e) => setNewAppt(prev => ({ ...prev, date: e.target.value }))}
                className={`w-full px-4 py-3 rounded-xl border-2 ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-800'
                } focus:border-blue-500 focus:outline-none`}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="time"
                  value={newAppt.start}
                  onChange={(e) => setNewAppt(prev => ({ ...prev, start: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border-2 ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-800'
                  } focus:border-blue-500 focus:outline-none`}
                />
                <input
                  type="time"
                  value={newAppt.end}
                  onChange={(e) => setNewAppt(prev => ({ ...prev, end: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border-2 ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-800'
                  } focus:border-blue-500 focus:outline-none`}
                />
              </div>
              <input
                type="text"
                placeholder="Client name (optional)"
                value={newAppt.client_name}
                onChange={(e) => setNewAppt(prev => ({ ...prev, client_name: e.target.value }))}
                className={`w-full px-4 py-3 rounded-xl border-2 ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                } focus:border-blue-500 focus:outline-none`}
              />
              <input
                type="text"
                placeholder="Location (optional)"
                value={newAppt.location}
                onChange={(e) => setNewAppt(prev => ({ ...prev, location: e.target.value }))}
                className={`w-full px-4 py-3 rounded-xl border-2 ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                } focus:border-blue-500 focus:outline-none`}
              />
              <textarea
                placeholder="Notes (optional)"
                value={newAppt.notes}
                onChange={(e) => setNewAppt(prev => ({ ...prev, notes: e.target.value }))}
                className={`w-full px-4 py-3 rounded-xl border-2 ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                } focus:border-blue-500 focus:outline-none resize-none`}
                rows={3}
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddApptModal(false)}
                className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={createAppointmentFromModal}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-all"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TennisScheduler;