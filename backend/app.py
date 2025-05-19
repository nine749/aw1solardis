import requests
from datetime import datetime, timedelta
import math
import json
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)  # Enable CORS to allow requests from your frontend

# Cache directory
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)


@app.route('/api/test-geocoding', methods=['GET'])
def test_geocoding():
    """Test endpoint for direct geocoding API call"""
    query = request.args.get('query', 'Bangkok')
    
    # Direct API call
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={query}&count=10&language=en"
    
    try:
        response = requests.get(url, timeout=10)
        # Return raw response
        return jsonify({
            'url': url,
            'status_code': response.status_code,
            'raw_response': response.json()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/geocode', methods=['GET'])
def geocode_location():
    """Search for locations using Open-Meteo Geocoding API"""
    try:
        query = request.args.get('query')
        
        if not query:
            return jsonify({'error': 'Search query is required'}), 400
            
        # Build URL with parameters
        url = "https://geocoding-api.open-meteo.com/v1/search"
        
        params = {
            'name': query,
            'count': 10,  # Number of results to return
            'language': 'en'  # Remove the format parameter as it's not needed
        }
        
        ## For focus search on Thailand
        # if not query.lower().endswith('thailand'):
        #     params['name'] = f"{query}, thailand"
        
        print(f"Geocoding API URL: {url}")
        print(f"Geocoding API Parameters: {params}")
        
        # Make the request
        response = requests.get(url, params=params, timeout=10)
        
        # Check for errors
        if response.status_code != 200:
            print(f"Geocoding API error: {response.status_code}")
            print(f"Response content: {response.text}")
            raise Exception(f"Geocoding API error: {response.status_code}")
        
        # Parse the response
        data = response.json()
        print(f"Raw geocoding response: {data}")
        
        # Extract results
        results = []
        if 'results' in data:
            for result in data['results']:
                # Filter for Thailand or nearby
                # You can uncomment this to limit to Thailand only
                # if (result.get('country') != 'Thailand' and not
                #    (5.0 <= result.get('latitude', 0) <= 21.0 and 
                #     97.0 <= result.get('longitude', 0) <= 106.0)):
                #    continue
                
                # Format the result
                admin_area = result.get('admin1', '') or ''
                country = result.get('country', '') or ''
                
                formatted_result = {
                    'name': result.get('name', ''),
                    'admin1': admin_area,  # Province/State
                    'country': country,
                    'lat': result.get('latitude'),
                    'lng': result.get('longitude'),
                    'display_name': f"{result.get('name', '')}, {admin_area}, {country}".replace(', ,', ',').strip(', ')
                }
                results.append(formatted_result)
        
        return jsonify({'results': results})
        
    except Exception as e:
        print(f"Geocoding error: {str(e)}")
        return jsonify({'error': 'Failed to search for location: ' + str(e)}), 500

@app.route('/api/test', methods=['GET'])
def test_endpoint():
    """Test endpoint to verify the API is working"""
    return jsonify({
        'status': 'success',
        'message': 'Solar Duration API is running!'
    })

@app.route('/api/test-openmeteo', methods=['GET'])
def test_openmeteo():
    """Test Open-Meteo API integration"""
    try:
        # Use Bangkok coordinates as a test
        lat = 13.7563
        lng = 100.5018
        
        # Call the Open-Meteo API
        data = fetch_openmeteo_data(lat, lng)
        
        # Return a simplified version of the data for inspection
        return jsonify({
            'status': 'success',
            'api_response': data
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/solar-data', methods=['GET'])
def get_solar_data():
    """Get solar data for specific coordinates"""
    try:
        lat = float(request.args.get('lat'))
        lng = float(request.args.get('lng'))
        
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
            return jsonify({
                'error': 'Invalid coord, Latitude must be between -90 and 90, longitude between -180 and 180.'
            }), 400
            
        # Check if data is in cache
        solar_data = get_cached_data(lat, lng)
        
        if not solar_data:
            # Fetch from Open-Meteo API
            weather_data = fetch_openmeteo_data(lat, lng)
            
            # Process data to calculate metrics
            solar_data = process_solar_data(weather_data, lat, lng)
            
            # Cache the results
            cache_data(lat, lng, solar_data)
        
        return jsonify(solar_data)
        
    except Exception as e:
        print(f"Error processing request: {str(e)}")
        return jsonify({'error': 'Failed to retrieve solar data: ' + str(e)}), 500


def fetch_openmeteo_data(lat, lng):
    """Fetch weather and solar data from Open-Meteo API"""
    
    # Calculate date range: past 90 days
    end_date = datetime.now()
    start_date = end_date - timedelta(days=90)  # 3 months historical data
    
    print(f"Fetching data from Open-Meteo API for coordinates ({lat}, {lng})")
    print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    
    # Build URL with parameters
    url = "https://archive-api.open-meteo.com/v1/archive"
    
    params = {
        'latitude': lat,
        'longitude': lng,
        'start_date': start_date.strftime('%Y-%m-%d'),
        'end_date': end_date.strftime('%Y-%m-%d'),
        'daily': 'temperature_2m_max,temperature_2m_min,sunrise,sunset,sunshine_duration,shortwave_radiation_sum',
        'timezone': 'auto'
    }
    
    print(f"Open-Meteo API URL: {url}")
    print(f"Open-Meteo API Parameters: {params}")
    
    try:
        # Make the request
        response = requests.get(url, params=params, timeout=30)
        
        # Check for errors
        if response.status_code != 200:
            print(f"Open-Meteo API returned status code {response.status_code}")
            print(f"Response content: {response.text}")
            raise Exception(f"Open-Meteo API error: {response.status_code}")
        
        # Parse the response
        data = response.json()
        
        # Validate the response has the expected structure
        if 'daily' not in data:
            print(f"Unexpected response structure: {data}")
            raise Exception("Unexpected response structure from Open-Meteo API")
        
        # Print some information about the data received
        daily = data.get('daily', {})
        time = daily.get('time', [])
        if time:
            print(f"Retrieved data for {len(time)} days")
            print(f"First date: {time[0]}, Last date: {time[-1]}")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"Open-Meteo API request failed: {e}")
        raise Exception(f"Open-Meteo API request failed: {e}")
    except ValueError as e:
        print(f"Failed to parse Open-Meteo API response: {e}")
        raise Exception(f"Failed to parse Open-Meteo API response: {e}")

def process_solar_data(weather_data, lat, lng):
    """Process Open-Meteo data into required solar metrics"""
    
    try:
        daily_data = weather_data.get('daily', {})
        
        # Extract the daily parameters from the response
        dates = daily_data.get('time', [])
        sunshine_duration = daily_data.get('sunshine_duration', [])  # in seconds
        shortwave_radiation = daily_data.get('shortwave_radiation_sum', [])  # in MJ/m²
        max_temp = daily_data.get('temperature_2m_max', [])  # in °C
        min_temp = daily_data.get('temperature_2m_min', [])  # in °C
        
        # Initialize daily data list
        processed_daily = []
        
        for i, date in enumerate(dates):
            # Skip if we don't have all the data we need
            if (i >= len(shortwave_radiation) or shortwave_radiation[i] is None or
                (sunshine_duration and i >= len(sunshine_duration)) or
                i >= len(max_temp) or max_temp[i] is None or
                i >= len(min_temp) or min_temp[i] is None):
                continue
            
            # Get shortwave radiation (GHI) in MJ/m²/day
            radiation_mj = shortwave_radiation[i]
            
            # Convert MJ/m² to kWh/m² (1 MJ = 0.2778 kWh)
            ghi = radiation_mj * 0.2778 if radiation_mj is not None else 0
            
            # Calculate sunlight hours
            # If sunshine_duration is available, use it (convert seconds to hours)
            if sunshine_duration and i < len(sunshine_duration) and sunshine_duration[i] is not None:
                sunshine_hours = sunshine_duration[i] / 3600  # Convert seconds to hours
            else:
                # Calculate sunlight hours based on radiation compared to clear-sky reference
                max_daylight = 12.5  # Bangkok average daylight hours
                clear_sky_radiation = 25.0  # MJ/m² for typical clear day in Thailand
                sunshine_hours = max_daylight * (radiation_mj / clear_sky_radiation) if radiation_mj else 0
            
            # Calculate PVOUT (Photovoltaic Output) in kWh/kWp/day
            system_efficiency = 0.20  # 20% efficiency (modern panels)
            performance_ratio = 0.80  # 80% PR (accounts for losses)
            temp_loss_per_degree = 0.004  # 0.4%/°C above 25°C (industry standard)

            # Temperature factor (less aggressive)
            avg_temp = (max_temp[i] + min_temp[i]) / 2
            temp_factor = 1 - max(0, (avg_temp - 25) * temp_loss_per_degree)

            # Final PVOUT calculation
            pvout = ghi * performance_ratio * temp_factor
            
            # Add to processed data
            processed_daily.append({
                'date': date,
                'sunlightHours': round(sunshine_hours, 1),
                'ghi': round(ghi, 1),
                'pvout': round(pvout, 1)
            })
        
        # Sort by date (newest first)
        processed_daily.sort(key=lambda x: x['date'], reverse=True)
        
        # Get the most recent 30 days
        recent_daily = processed_daily[:30]
        
        # Process monthly data
        if processed_daily:
            df = pd.DataFrame(processed_daily)
            
            # Add date object column for easier grouping
            df['date_obj'] = pd.to_datetime(df['date'])
            df['month'] = df['date_obj'].dt.strftime('%Y-%m')
            df['month_name'] = df['date_obj'].dt.strftime('%b %Y')
            
            # Group by month and calculate averages
            monthly_data = df.groupby(['month', 'month_name']).agg({
                'sunlightHours': 'mean',
                'ghi': 'mean',
                'pvout': 'mean'
            }).reset_index()
            
            # Sort by date (newest first)
            monthly_data['date_obj'] = pd.to_datetime(monthly_data['month'])
            monthly_data = monthly_data.sort_values('date_obj', ascending=False)
            
            # Get the most recent 3 months
            monthly_data = monthly_data.head(3)
            
            # Create the monthly results list
            monthly_results = []
            for _, row in monthly_data.iterrows():
                monthly_results.append({
                    'date': row['month_name'],
                    'sunlightHours': round(row['sunlightHours'], 1),
                    'ghi': round(row['ghi'], 1),
                    'pvout': round(row['pvout'], 1)
                })
                
            # monthly_results.reverse()
            
            # Add year column for yearly aggregation
            df['year'] = df['date_obj'].dt.year
            
            # Group by year and calculate averages
            yearly_data = df.groupby('year').agg({
                'sunlightHours': 'mean',
                'ghi': 'mean',
                'pvout': 'mean'
            }).reset_index()
            
            # Sort by year (newest first)
            yearly_data = yearly_data.sort_values('year', ascending=False)
            
            # Create the yearly results list
            yearly_results = []
            for _, row in yearly_data.iterrows():
                yearly_results.append({
                    'date': str(int(row['year'])),
                    'sunlightHours': round(row['sunlightHours'], 1),
                    'ghi': round(row['ghi'], 1),
                    'pvout': round(row['pvout'], 1)
                })
        
            # yearly_results.reverse()
        else:
            monthly_results = []
            yearly_results = []
        
        # Get data range info for display
        if recent_daily:
            start_date = recent_daily[0]['date']
            end_date = recent_daily[-1]['date']
        else:
            start_date = "unknown"
            end_date = "unknown"
        
        # Prepare final result structure
        results = {
            'coordinates': {
                'lat': lat,
                'lng': lng
            },
            'daily': recent_daily,
            'monthly': monthly_results,
            'yearly': yearly_results,
            'date_range': {
                'start': start_date,
                'end': end_date,
                'current_date': datetime.now().strftime('%Y-%m-%d')
            }
        }
        
        return results
        
    except Exception as e:
        print(f"Error processing solar data: {str(e)}")
        raise Exception(f"Error processing solar data: {str(e)}")

def get_cache_filename(lat, lng):
    """Generate a unique cache filename based on coordinates"""
    # Round to 4 decimal places for reasonable precision (~11 meters)
    lat_rounded = round(lat, 4)
    lng_rounded = round(lng, 4)
    return os.path.join(CACHE_DIR, f"solar_data_{lat_rounded}_{lng_rounded}.json")

def get_cached_data(lat, lng):
    """Retrieve cached data if available and not expired"""
    cache_file = get_cache_filename(lat, lng)
    
    if os.path.exists(cache_file):
        # Check cache age
        file_modified_time = os.path.getmtime(cache_file)
        cache_age = datetime.now().timestamp() - file_modified_time
        
        # Cache expiration: 1 day (OpenMeteo data updates daily)
        if cache_age < 24 * 60 * 60:
            try:
                print(f"Using cached data for ({lat}, {lng})")
                with open(cache_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error reading cache file: {str(e)}")
                # If there's any issue with the cache file, ignore it
                pass
        else:
            print(f"Cache expired for ({lat}, {lng})")
    else:
        print(f"No cache found for ({lat}, {lng})")
    
    return None

def cache_data(lat, lng, data):
    """Cache the solar data to file"""
    cache_file = get_cache_filename(lat, lng)
    
    try:
        with open(cache_file, 'w') as f:
            json.dump(data, f)
        print(f"Data cached for ({lat}, {lng})")
    except Exception as e:
        # Log the error but don't fail the request
        print(f"Error caching data: {str(e)}")

if __name__ == '__main__':
    app.run(debug=True)