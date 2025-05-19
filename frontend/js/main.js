// Map start @BKK
let map = L.map('map-container').setView([13.7563, 100.5018], 6);

// Base map layer configuration
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Global references
let marker = null;
let solarChart = null;

// Constants
const DEFAULT_CHART_HEIGHT = 220;
const API_BASE_URL = 'http://localhost:5000'; // Update with your deployment URL in production

// State tracking
let locationSelected = false;
let currentData = null;

// Update data table with current dataset
function updateTable(data) {
    const tbody = document.getElementById('data-tbody');
    tbody.innerHTML = '';
    
    if (!data || data.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.textContent = 'No data available';
        cell.style.textAlign = 'center';
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
    }
    
    data.forEach(item => {
        const row = document.createElement('tr');
        
        const dateCell = document.createElement('td');
        dateCell.textContent = item.date; // Now consistently named 'date' in all datasets
        row.appendChild(dateCell);
        
        const sunlightCell = document.createElement('td');
        sunlightCell.textContent = item.sunlightHours;
        row.appendChild(sunlightCell);
        
        const ghiCell = document.createElement('td');
        ghiCell.textContent = item.ghi;
        row.appendChild(ghiCell);
        
        const pvoutCell = document.createElement('td');
        pvoutCell.textContent = item.pvout;
        row.appendChild(pvoutCell);
        
        tbody.appendChild(row);
    });
}

// Render+update solar data chart
function updateChart(data, period) {
    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = '';
    // chartContainer.style.height = `${DEFAULT_CHART_HEIGHT}px`;
    
    if (!data || data.length === 0) {
        chartContainer.innerHTML = '<div style="text-align: center; padding: 40px;">No data available for chart visualization</div>';
        return;
    }
    
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'solar-chart';
    chartContainer.appendChild(newCanvas);
    
    const ctx = newCanvas.getContext('2d');
    const labels = data.map(item => item.date);
    const sunlightData = data.map(item => item.sunlightHours);
    const ghiData = data.map(item => item.ghi);
    const pvoutData = data.map(item => item.pvout);
    
    solarChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sunlight Hours',
                    data: sunlightData,
                    borderColor: 'yellow',
                    backgroundColor: 'rgba(255, 255, 0, 0.1)',
                    tension: 0.1
                },
                {
                    label: 'GHI',
                    data: ghiData,
                    borderColor: 'red',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    tension: 0.1
                },
                {
                    label: 'PVOUT',
                    data: pvoutData,
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'white',
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            return tooltipItems[0].label;
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1);
                                
                                if (context.dataset.label === 'Sunlight Hours') {
                                    label += ' hours';
                                } else if (context.dataset.label === 'GHI') {
                                    label += ' kWh/m²/day';
                                } else if (context.dataset.label === 'PVOUT') {
                                    label += ' kWh/kWp/day';
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        color: 'white'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: 'white',
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

// Show loading state in the data panel
function showLoading() {
    const solarData = document.getElementById('solar-data');
    solarData.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 200px;">
            <div>
                <div style="text-align: center; margin-bottom: 15px;">Loading solar data...</div>
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; margin: 0 auto; animation: spin 1s linear infinite;"></div>
            </div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
}

// Show error message
function showError(message) {
    // Remove any existing error
    const existingError = document.querySelector('.search-error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Create error message
    const errorElement = document.createElement('div');
    errorElement.className = 'search-error-message';
    errorElement.textContent = message;
    
    // Append to search container
    document.querySelector('.search-container').appendChild(errorElement);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (errorElement.parentNode) {
            errorElement.parentNode.removeChild(errorElement);
        }
    }, 3000);
}

async function fetchSolarData(lat, lng) {
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE_URL}/api/solar-data?lat=${lat}&lng=${lng}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch solar data');
        }
        
        const data = await response.json();
        currentData = data;
        
        // Instead of completely replacing the HTML, just update the necessary elements
        const solarData = document.getElementById('solar-data');
        
        // Preserve the existing structure and just clear the dynamic content
        const tableContainer = solarData.querySelector('.table-container') || document.createElement('div');
        tableContainer.className = 'table-container';
        tableContainer.innerHTML = `
            <table id="data-table">
                <thead>
                    <tr>
                        <th id="date-header">Date</th>
                        <th>Sunlight Hours</th>
                        <th>GHI (kWh/m²/day)</th>
                        <th>PVOUT (kWh/kWp/day)</th>
                    </tr>
                </thead>
                <tbody id="data-tbody">
                    <!-- Data rows will be inserted here -->
                </tbody>
            </table>
        `;
        
        const chartContainer = solarData.querySelector('#chart-container') || document.createElement('div');
        chartContainer.id = 'chart-container';
        chartContainer.innerHTML = '<canvas id="solar-chart"></canvas>';
        
        // Update the solarData content while preserving the structure
        solarData.innerHTML = '';
        solarData.appendChild(document.createElement('h4')).id = 'period-title';
        solarData.appendChild(tableContainer);
        solarData.appendChild(chartContainer);
        
        document.getElementById('period-title').textContent = 'Daily Solar Metrics';
        
        loadData(document.getElementById('period-select').value);
        return data;
    } catch (error) {
        console.error('Error fetching solar data:', error);
        showError(error.message);
        throw error;
    }
}

// Load data for selected time period
function loadData(period) {
    if (!currentData) return;
    
    let periodTitle = '';
    let data;
    
    // Get the earliest and latest dates from the data for display
    let earliestDate = "unknown";
    let latestDate = "unknown";
    
    if (currentData.daily && currentData.daily.length > 0) {
        earliestDate = currentData.daily[0].date;
        latestDate = currentData.daily[currentData.daily.length - 1].date;
    }
    
    switch(period) {
        case 'daily':
            periodTitle = `Daily Solar Metrics`;
            data = currentData.daily;
            document.getElementById('date-header').textContent = 'Date';
            break;
        case 'monthly':
            periodTitle = 'Monthly Solar Metrics';
            data = currentData.monthly;
            document.getElementById('date-header').textContent = 'Month';
            break;
        //case 'yearly':
        //    periodTitle = 'Yearly Solar Metrics';
        //  data = currentData.yearly;
        //  document.getElementById('date-header').textContent = 'Year';
        //  break;
    }
    
    document.getElementById('period-title').textContent = periodTitle;
    
    updateTable(data);
    updateChart(data, period);
}

map.on('click', async function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    console.log(`Clicked at coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    
    // Update marker
    if (marker) {
        marker.setLatLng(e.latlng);
    } else {
        marker = L.marker(e.latlng).addTo(map);
    }
    
    document.getElementById('lat').textContent = lat.toFixed(6);
    document.getElementById('lng').textContent = lng.toFixed(6);
    document.getElementById('location-name').textContent = `Selected Location`;
    
    // Always ensure panel is expanded and interactive when new location is selected
    const panel = document.getElementById('data-panel');
    panel.classList.remove('collapsed');
    panel.classList.remove('hidden');
    
    panel.style.width = '650px';
    panel.style.maxWidth = '650px';
    panel.style.padding = '15px';
    panel.style.overflow = 'auto';
    panel.style.pointerEvents = 'auto';
    panel.style.flex = '0 0 650px';
    panel.style.opacity = '1';
    
    document.getElementById('toggle-panel').textContent = '◀';
    document.querySelector('.panel-toggle').style.left = '-15px';
    
    try {
        await fetchSolarData(lat, lng);
        locationSelected = true;
        rebindPanelInteractions(); // Ensure interactions are properly bound
    } catch (error) {
        locationSelected = false;
    }
    
    setTimeout(() => {
        map.invalidateSize();
        if (solarChart) solarChart.resize();
    }, 300);
});

// Search button and Enter key handling
document.querySelector('.search-container button').addEventListener('click', function() {
    const searchInput = document.querySelector('.search-container input').value.trim();
    if (searchInput.length < 2) return;
    
    // If dropdown is visible with results, use the first one
    if (searchDropdown && searchDropdown.children.length > 0) {
        // Simulate click on first result
        searchDropdown.children[0].click();
    } else {
        // Perform new search
        performSearch(searchInput);
    }
});

document.querySelector('.search-container input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const searchInput = this.value.trim();
        if (searchInput.length < 2) return;
        
        // If dropdown is visible with results, use the first one
        if (searchDropdown && searchDropdown.children.length > 0) {
            // Simulate click on first result
            searchDropdown.children[0].click();
        } else {
            // Perform new search
            performSearch(searchInput);
        }
    }
});

// Perform a search
async function performSearch(query) {
    try {
        // Show loading indicator
        document.querySelector('.search-container button').innerHTML = 
            '<span class="loading-spinner"></span>';
        
        const response = await fetch(`${API_BASE_URL}/api/geocode?query=${encodeURIComponent(query)}`);
        
        // Reset search button
        document.querySelector('.search-container button').innerHTML = '🔍';
        
        if (!response.ok) {
            throw new Error('Search failed');
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            showError('No results found. Please try a different search term.');
            return;
        }
        
        // Apply the first result
        applyLocationSelection(data.results[0]);
        
    } catch (error) {
        console.error('Search error:', error);
        document.querySelector('.search-container button').innerHTML = '🔍';
        showError('Search failed. Please try again.');
    }
}

// Modify the input event listener
document.querySelector('.search-container input').addEventListener('input', function() {
    // Clear any stored selection when the user types
    selectedSearchResult = null;
    
    const searchInput = this.value.trim();
    
    // Remove any existing error message
    const existingError = document.querySelector('.search-error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // If the input is too short, remove any dropdown
    if (searchInput.length < 2) {
        const existingDropdown = document.querySelector('.search-results-dropdown');
        if (existingDropdown) {
            existingDropdown.remove();
        }
        return;
    }
    
    // If input is long enough, fetch suggestions (only implement if you want autocomplete)
    // This part is optional, so you can just end the function here if you don't want autocomplete
});

// Modify your searchLocation function to only show alerts on explicit searches
async function searchLocation() {
    const searchInput = document.querySelector('.search-container input').value.trim();
    
    if (!searchInput) return;
    
    try {
        // Show loading indicator
        document.querySelector('.search-container button').innerHTML = '<span class="loading-spinner"></span>';
        
        // Call your backend endpoint
        const response = await fetch(`${API_BASE_URL}/api/geocode?query=${encodeURIComponent(searchInput)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Geocoding failed');
        }
        
        const data = await response.json();
        
        // Reset the search button
        document.querySelector('.search-container button').innerHTML = '🔍';
        
        // Only show alert for empty results when user explicitly searches
        if (!data.results || data.results.length === 0) {
            alert('Location not found. Please try a different search term.');
            return;
        }
        
        // Display search results
        displaySearchResults(data.results);
        
    } catch (error) {
        console.error('Search error:', error);
        // Reset the search button
        document.querySelector('.search-container button').innerHTML = '🔍';
        alert('Unable to search for location. Please try again later.');
    }
}

// Period selection handler
document.getElementById('period-select').addEventListener('change', function() {
    loadData(this.value);
});

// Panel toggle handler
document.getElementById('toggle-panel').addEventListener('click', function() {
    if (!locationSelected) return;
    
    const panel = document.getElementById('data-panel');
    const isCollapsing = !panel.classList.contains('collapsed');
    
    panel.classList.toggle('collapsed');
    
    if (isCollapsing) {
        this.textContent = '▶';
        document.querySelector('.panel-toggle').style.left = '-25px';
    } else {
        this.textContent = '◀';
        document.querySelector('.panel-toggle').style.left = '-15px';
        rebindPanelInteractions();
    }
    
    setTimeout(() => {
        map.invalidateSize();
        if (solarChart) solarChart.resize();
    }, 300);
});

function rebindPanelInteractions() {
    // Rebind period selector
    const periodSelect = document.getElementById('period-select');
    if (periodSelect) {
        periodSelect.addEventListener('change', function() {
            loadData(this.value);
        });
    }
    
    // Rebind chart interactions if chart exists
    if (solarChart) {
        const chartCanvas = document.getElementById('solar-chart');
        if (chartCanvas) {
            chartCanvas.style.pointerEvents = 'auto';
        }
        solarChart.resize();
    }
    
    // Ensure table is scrollable
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
        tableContainer.style.overflowX = 'auto';
        tableContainer.style.pointerEvents = 'auto';
    }
}

// Panel resizing implementation
(function() {
    const resizer = document.getElementById('panel-resizer');
    const leftPanel = document.getElementById('map-container');
    const rightPanel = document.getElementById('data-panel');
    
    let initialMouseX = 0;
    let initialLeftWidth = 0;
    
    resizer.addEventListener('mousedown', function(e) {
        if (rightPanel.classList.contains('collapsed')) return;
        
        initialMouseX = e.clientX;
        initialLeftWidth = leftPanel.getBoundingClientRect().width;
        document.body.classList.add('resizing');
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    });
    
    function handleMouseMove(e) {
        if (rightPanel.classList.contains('collapsed')) return;
        
        const dampingFactor = 0.05;
        const delta = (e.clientX - initialMouseX) * dampingFactor;
        const rightPanelInitialWidth = rightPanel.getBoundingClientRect().width;
        let newRightPanelWidth = rightPanelInitialWidth - delta;
        
        newRightPanelWidth = Math.max(500, Math.min(900, newRightPanelWidth));
        
        rightPanel.style.width = `${newRightPanelWidth}px`;
        rightPanel.style.maxWidth = `${newRightPanelWidth}px`;
        rightPanel.style.flex = `0 0 ${newRightPanelWidth}px`;
        leftPanel.style.flex = '1 1 auto';
        
        if (locationSelected && solarChart) {
            // const chartContainer = document.getElementById('chart-container');
            // const chartHeight = Math.max(DEFAULT_CHART_HEIGHT, Math.min(450, Math.round(newRightPanelWidth * 0.4)));
            // chartContainer.style.height = `${chartHeight}px`;
            solarChart.resize();
        }
    }
    
    function handleMouseUp() {
        document.body.classList.remove('resizing');
        if (solarChart) solarChart.resize();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
})();

// Application initialization
function initializeApp() {
    const panel = document.getElementById('data-panel');
    panel.classList.remove('hidden');
    panel.classList.add('collapsed');
    
    panel.style.width = '0';
    panel.style.maxWidth = '0';
    panel.style.padding = '0';
    panel.style.overflow = 'hidden';
    panel.style.flex = '0 0 0';
    panel.style.opacity = '0';
    
    document.getElementById('toggle-panel').textContent = '▶';
    document.querySelector('.panel-toggle').style.left = '-25px';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
}

let selectedSearchResult = null;
let searchDropdown = null;

function displaySearchResults(results) {
    // Remove any existing dropdown
    if (searchDropdown) {
        searchDropdown.remove();
    }
    
    // Create dropdown
    searchDropdown = document.createElement('div');
    searchDropdown.className = 'search-results-dropdown';
    
    // Add results to dropdown
    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.textContent = result.display_name || result.name;
        
        // When an item is clicked
        item.addEventListener('click', () => {
            document.querySelector('.search-container input').value = 
                result.display_name || result.name;
            
            if (searchDropdown) {
                searchDropdown.remove();
                searchDropdown = null;
            }
            
            // Apply the selection directly
            applyLocationSelection(result);
        });
        
        searchDropdown.appendChild(item);
    });
    
    // Position and append dropdown
    const searchContainer = document.querySelector('.search-container');
    searchContainer.appendChild(searchDropdown);
}

// Apply the selection to the map
function applyLocationSelection(result) {
    // Extract coordinates
    const lat = result.lat;
    const lng = result.lng;
    
    console.log(`Selected location: ${result.display_name}, Coordinates: ${lat}, ${lng}`);
    
    // Update location name
    document.getElementById('location-name').textContent = result.display_name || result.name;
    
    // Center map and create/update marker
    map.setView([lat, lng], 13); // Zoom level 13 for city view
    
    // Update or create marker at exact coordinates
    if (marker) {
        marker.setLatLng([lat, lng]);
    } else {
        marker = L.marker([lat, lng]).addTo(map);
    }
    
    // Update coordinate display
    document.getElementById('lat').textContent = parseFloat(lat).toFixed(6);
    document.getElementById('lng').textContent = parseFloat(lng).toFixed(6);
    
    // Update panel
    const panel = document.getElementById('data-panel');
    panel.classList.remove('collapsed');
    panel.classList.remove('hidden');
    
    panel.style.width = '650px';
    panel.style.maxWidth = '650px';
    panel.style.padding = '15px';
    panel.style.overflow = 'auto';
    panel.style.pointerEvents = 'auto';
    panel.style.flex = '0 0 650px';
    panel.style.opacity = '1';
    
    document.getElementById('toggle-panel').textContent = '◀';
    document.querySelector('.panel-toggle').style.left = '-15px';
    
    // Fetch solar data for this location
    fetchSolarData(lat, lng);
    
    // Force map update
    setTimeout(() => {
        map.invalidateSize();
    }, 300);
}

// Function to handle selecting a search result
function selectSearchResult(result) {
    const lat = result.lat;
    const lng = result.lng;
    
    // Update location name to display the found location
    document.getElementById('location-name').textContent = result.display_name;
    
    // Move map to location
    map.setView([lat, lng], 10);
    
    // Trigger a simulated click at this location
    map.fireEvent('click', {
        latlng: L.latLng(lat, lng)
    });
}

async function searchLocation() {
    const searchInput = document.querySelector('.search-container input').value.trim();
    
    if (!searchInput) return;
    
    // If we have a stored selection, use it
    if (selectedSearchResult) {
        applySearchResult(selectedSearchResult);
        selectedSearchResult = null; // Clear the selection after using it
        return;
    }
    
    // Otherwise, perform a new search
    try {
        // Show loading indicator
        document.querySelector('.search-container button').innerHTML = '<span class="loading-spinner"></span>';
        
        // Call your backend endpoint
        const response = await fetch(`${API_BASE_URL}/api/geocode?query=${encodeURIComponent(searchInput)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Geocoding failed');
        }
        
        const data = await response.json();
        
        // Reset the search button
        document.querySelector('.search-container button').innerHTML = '🔍';
        
        if (!data.results || data.results.length === 0) {
            alert('Location not found. Please try a different search term.');
            return;
        }
        
        // If we got exactly one result, apply it directly
        if (data.results.length === 1) {
            applySearchResult(data.results[0]);
        } else {
            // Otherwise, display results for user to choose from
            displaySearchResults(data.results);
        }
        
    } catch (error) {
        console.error('Search error:', error);
        // Reset the search button
        document.querySelector('.search-container button').innerHTML = '🔍';
        alert('Unable to search for location. Please try again later.');
    }
}

function applySearchResult(result) {
    const lat = result.lat;
    const lng = result.lng;
    
    // Validate coordinates are within Thailand
    if (!(5.0 <= lat && lat <= 21.0 && 97.0 <= lng && lng <= 106.0)) {
        // Show error message without alert
        const errorMessage = document.createElement('div');
        errorMessage.className = 'search-error-message';
        errorMessage.innerHTML = 'Coordinates out of range.';
        
        const searchContainer = document.querySelector('.search-container');
        searchContainer.appendChild(errorMessage);
        
        // Remove the message after 3 seconds
        setTimeout(() => {
            if (errorMessage.parentNode) {
                errorMessage.parentNode.removeChild(errorMessage);
            }
        }, 3000);
        
        return;
    }
    
    // Update location name to display the found location
    document.getElementById('location-name').textContent = result.display_name || result.name;
    
    // Move map to location
    map.setView([lat, lng], 10);
    
    // Trigger a simulated click at this location
    map.fireEvent('click', {
        latlng: L.latLng(lat, lng)
    });
}

// Add debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Search input handler
document.querySelector('.search-container input').addEventListener('input', function() {
    // Clear any stored selection when the user types
    selectedSearchResult = null;
    
    const searchInput = this.value.trim();
    
    // Remove any existing error message
    const existingError = document.querySelector('.search-error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // If the input is too short, remove any dropdown
    if (searchInput.length < 2) {
        if (searchDropdown) {
            searchDropdown.remove();
            searchDropdown = null;
        }
        return;
    }
    
    // Debounce to avoid too many requests
    clearTimeout(this.searchTimeout);
    
    this.searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/geocode?query=${encodeURIComponent(searchInput)}`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch suggestions');
            }
            
            const data = await response.json();
            
            // Only display results if there are any
            if (data.results && data.results.length > 0) {
                displaySearchResults(data.results);
            } else if (searchDropdown) {
                searchDropdown.remove();
                searchDropdown = null;
            }
        } catch (error) {
            console.error('Error fetching suggestions:', error);
        }
    }, 300); // Wait 300ms after typing stops
});

// Function to fetch suggestions
async function fetchSearchSuggestions(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/geocode?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch suggestions');
        }
        
        const data = await response.json();
        
        // Display suggestions without showing alerts for empty results
        if (data.results && data.results.length > 0) {
            displaySearchResults(data.results);
        } else {
            // Just hide the dropdown if no results
            const existingDropdown = document.querySelector('.search-results-dropdown');
            if (existingDropdown) {
                existingDropdown.remove();
            }
        }
        
    } catch (error) {
        console.error('Error fetching suggestions:', error);
        // Don't show alerts for autocomplete errors
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initializeApp);
window.addEventListener('resize', function() {
    map.invalidateSize();
    if (solarChart) solarChart.resize();
});