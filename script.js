const fileSelector = document.querySelector('input');
const start = document.getElementById('start');
const img = document.querySelector('img');
const upper = document.getElementById('upper');
const calendarGrid = document.getElementById('calendar-grid');
const dateBox = document.getElementById('edit');
const uploadContainer = document.getElementById('upload-container');
const bottom = document.getElementById('bottom');
const loadingCircle = document.getElementById('loading');
const imgBox = document.getElementById('image-box');
const changeImage = document.getElementById('change-image');


// Create UI buttons programmatically for Google Calendar
const authButton = document.getElementById('login');

const exportButton = document.createElement('button');
exportButton.innerHTML = 'Export to Google Calendar';
exportButton.classList.add("button");

// hide some elements on load
imgBox.style.display = "none";
calendarGrid.style.display = "none";
dateBox.style.display = "none";
bottom.style.display = 'none';
changeImage.style.display = 'none';

// add buttons to top bar

const BACKEND_URL = 'http://localhost:3000';

// Check if the user just returned from a successful Google OAuth login
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
    } else if (urlParams.get('auth') === 'error') {
    }
};

// =========================================================
// CLIPBOARD PASTE IMAGE HANDLING
// =========================================================
document.addEventListener('paste', async (event) => {
    // 1. Access clipboard data items
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    let file = null;

    // 2. Loop through items to find an image file
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            file = items[i].getAsFile();
            break;
        }
    }

    if (!file) return;
    event.preventDefault();

    // 3. Sync the pasted file with your hidden input file selector
    // This keeps your code consistent so other features know a file exists
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileSelector.files = dataTransfer.files;

    // --- STEP 1: Update UI Containers (Same as fileSelector.onchange) ---
    imgBox.style.display = "flex";
    uploadContainer.style.display = 'none';
    changeImage.style.display = 'flex';
    
            
    
    // Render the local preview source
    const imgUrl = window.URL.createObjectURL(file);
    img.src = imgUrl;

    const formData = new FormData();
    formData.append('timetable', file);

    try {
        const response = await fetch(`${BACKEND_URL}/api/extract-schedule`, {
             method: 'POST',
             body: formData
        });
        
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Server error occurred during processing.');
        }

        dateBox.style.display = "flex";
        bottom.style.display = "flex";
        loadingCircle.style.display = "none";

        calendarGrid.style.display = "grid";
        // Re-render editable calendar cards
        renderCalendar(data.schedule);

    } catch (error) {
        if (loadingCircle) loadingCircle.style.display = "none";
        console.error("Paste extraction workflow broken:", error);
    }
});



// Display image on upload
fileSelector.onchange = async () => {
    const file = fileSelector.files[0];
    if (!file) return;

    // --- STEP 1: UI Layout Mutations (Reveal your layout spaces) ---
    imgBox.style.display = "flex";
    uploadContainer.style.display = 'none';
    bottom.style.display = "flex";
    
    // Render the local preview source
    var imgUrl = window.URL.createObjectURL(file);
    img.src = imgUrl;

    // --- STEP 2: Instant Background Extraction Flow ---

    const formData = new FormData();
    formData.append('timetable', file);

    try {
        const response = await fetch(`${BACKEND_URL}/api/extract-schedule`, {
             method: 'POST',
             body: formData
        });
        
        const data = await response.json();

        // Check response validation AFTER parsing payload
        if (!response.ok) {
            throw new Error(data.error || 'Server error occurred during processing.');
        }

        dateBox.style.display = "flex";
        bottom.style.display = "flex";
        loadingCircle.style.display = "none";
        changeImage.style.display = 'flex';

        // Re-render your editable data blocks dynamically
        calendarGrid.style.display = "grid";

        renderCalendar(data.schedule);

    } catch (error) {
        console.error("Extraction workflow broken:", error);
    }
};

// Kick off OAuth authentication when clicked
authButton.onclick = async () => {
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/google`);
        const data = await response.json();
        
        // Redirect the user's entire browser tab straight to Google's login portal
        window.location.href = data.url;
    } catch (error) {
        console.error(error);
    }
};

// change image button handling
changeImage.addEventListener('click', () => {
    // reset to home page
    imgBox.style.display = "none";
    calendarGrid.style.display = "none";
    dateBox.style.display = "none";
    bottom.style.display = 'none';
    uploadContainer.style = 'flex';
    fileSelector.value = '';
})

// Adding a break range
document.addEventListener('DOMContentLoaded', () => {
    const addBreakBtn = document.getElementById('add-break-btn');
    const breaksContainer = document.getElementById('breaks-container');

    // Function to add a new break range row
    addBreakBtn.addEventListener('click', () => {
        const breakRow = document.createElement('div');
        breakRow.className = 'break-row';

        breakRow.innerHTML = `
            <div class="date-group">
                <input type="date" class="date-input break-start" aria-label="Break Start Date">
            </div>
            <span style="color: #f6cf8a;">to</span>
            <div class="date-group">
                <input type="date" class="date-input break-end" aria-label="Break End Date">
            </div>
            <button type="button" class="remove-btn" title="Remove Break">&times;</button>
        `;

        // Event listener to remove this specific break row when clicking the 'X'
        breakRow.querySelector('.remove-btn').addEventListener('click', () => {
            breakRow.remove();
        });

        breaksContainer.appendChild(breakRow);
    });
});


// Dynamically build your editable day divs
function renderCalendar(scheduleByDay) {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) {
        console.error("Missing container element: Add <div id='calendar-grid'></div> to your HTML.");
        return;
    }
    
    calendarGrid.innerHTML = '';
    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    daysOrder.forEach(dayName => {
        const dayColumn = document.createElement('div');
        dayColumn.classList.add('day-column');
        // Set a data attribute so we can find this column easily when collecting inputs later
        dayColumn.setAttribute('data-day', dayName);

        const dayHeader = document.createElement('h3');
        dayHeader.classList.add('day-header');
        dayHeader.innerText = dayName;
        dayColumn.appendChild(dayHeader);

        const dayEvents = scheduleByDay[dayName] || [];

        if (dayEvents.length === 0) {
            // const noClassMessage = document.createElement('p');
            // noClassMessage.classList.add('no-class-msg');
            // noClassMessage.innerText = 'No classes';
            // dayColumn.appendChild(noClassMessage);
        } else {
            dayEvents.forEach(item => {
                const classCard = document.createElement('div');
                classCard.classList.add('class-card');

                // Inputs keep values completely flexible for manual corrections
                classCard.innerHTML = `
                    <input type="text" class="edit-code" value="${item.course_code}" />
                    <div class="time-row">
                        <input type="text" class="edit-start" value="${item.start_time}" />
                        <span>-</span>
                        <input type="text" class="edit-end" value="${item.end_time}" />
                    </div>
                    <input type="text" class="edit-room" value="${item.room}" />
                `;
                dayColumn.appendChild(classCard);
            });
        }
        calendarGrid.appendChild(dayColumn);
    });
}



// Helper function to extract all chosen dates when parsing your timetable data
function getSemesterDateData() {
    const termStartStr = document.getElementById('first-class').value;
    const termEndStr = document.getElementById('last-class').value;
    
    // 1. Check if the master term dates are missing completely
    if (!termStartStr || !termEndStr) {
        alert("Please enter both the first and last day of classes.");
        return null; 
    }

    const termStart = new Date(termStartStr);
    const termEnd = new Date(termEndStr);

    // 2. Validate that the semester starts before it ends
    if (termStart >= termEnd) {
        alert("Invalid Semester Range: The first day of classes must be before the last day.");
        return null;
    }
    
    const breaks = [];
    let breaksValid = true;

    document.querySelectorAll('.break-row').forEach((row, index) => {
        const startStr = row.querySelector('.break-start').value;
        const endStr = row.querySelector('.break-end').value;
        
        // Skip completely blank rows, but flag incomplete ones
        if (!startStr && !endStr) return;
        if (!startStr || !endStr) {
            alert(`Break row #${index + 1} has an incomplete date range.`);
            breaksValid = false;
            return;
        }

        const breakStart = new Date(startStr);
        const breakEnd = new Date(endStr);

        // 3. Check if the individual break row is chronologically backwards
        if (breakStart > breakEnd) {
            alert(`Invalid Break Range: Break #${index + 1} ends before it starts.`);
            breaksValid = false;
            return;
        }

        // 4. Check if the break actually falls inside the school semester window
        if (breakStart < termStart || breakEnd > termEnd) {
            alert(`Invalid Break Range: Break #${index + 1} must fall within the semester dates.`);
            breaksValid = false;
            return;
        }

        // If it passes all checks, save the original strings
        breaks.push({ start: startStr, end: endStr });
    });

    // If any break was invalid, halt execution
    if (!breaksValid) return null;

    // Return the clean verified data ready for calendar layout rendering!
    return {
        termStart: termStartStr,
        termEnd: termEndStr,
        breaks
    };
}

// =========================================================
// READ EDITED DATA & INJECT TO GOOGLE CALENDAR
// =========================================================
exportButton.onclick = async () => {
    if (dateBox.style.display == 'none') {
        alert("Parse your timetable image before exporting.");
        return;
    }
    const dateData = getSemesterDateData();
    if (!dateData) return;

    const calendarGrid = document.getElementById('calendar-grid');
    const dayColumns = calendarGrid?.querySelectorAll('.day-column');

    if (!dayColumns || dayColumns.length === 0) {
        return;
    }


    // RE-ASSEMBLE DATA: Read current text values directly from the UI inputs
    const updatedSchedule = {
        Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: []
    };

    dayColumns.forEach(column => {
        const dayName = column.getAttribute('data-day');
        const cards = column.querySelectorAll('.class-card');

        cards.forEach(card => {
            updatedSchedule[dayName].push({
                course_code: card.querySelector('.edit-code').value,
                start_time: card.querySelector('.edit-start').value,
                end_time: card.querySelector('.edit-end').value,
                room: card.querySelector('.edit-room').value
            });
        });
    });

    try {
        const response = await fetch(`${BACKEND_URL}/api/create-events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                schedule: updatedSchedule,
                termStart: dateData.termStart,
                termEnd: dateData.termEnd,
                breaks: dateData.breaks
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to inject calendar events.');
        }


    } catch (error) {
        console.error(error);
    }
};