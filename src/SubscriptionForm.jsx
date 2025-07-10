import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Our Supabase client
import { Loader } from './Loader';

// Replace with your actual Google Geocoding API key
const GOOGLE_GEOCODING_API_KEY = 'AIzaSyA4mO81HGGcBV_bEoz9HlRrM0y_rLArvh0';

// Replace with the actual deployed URL of your secure backend email endpoint
const RESEND_EMAIL_ENDPOINT = 'https://dzmvznbqvbepxwzhwhcp.supabase.co/functions/v1/send-confirmation-email'; 

export function SubscriptionForm() {
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '',
    country: '',
    admin1_code: '',
    admin2_code: '',
    admin3_code: '',
    admin4_code: '',
    preferred_language_code: '',
  });
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // State for situation analysis data and typewriter effect
  const [situationAnalysis, setSituationAnalysis] = useState([]); // To store the full data
  const [displayedSummary, setDisplayedSummary] = useState(''); // For typewriter effect
  const [fullSummaryText, setFullSummaryText] = useState(''); // Holds the complete text for typewriter

  // State for dropdown options
  const [languages, setLanguages] = useState([]);
  const [countries, setCountries] = useState([]);
  const [admin1s, setAdmin1s] = useState([]);
  const [admin2s, setAdmin2s] = useState([]);
  const [admin3s, setAdmin3s] = useState([]);
  const [admin4s, setAdmin4s] = useState([]);

  // --- Cascading Dropdowns for Location Helper Function ---
  async function fetchAdminLevels(targetCodeCol, parentCode, setFunction, parentFilterCol) {
    let query = supabase.from('geospatial_admin_codes').select(`${targetCodeCol}, location_name`);

    if (parentCode && parentFilterCol) {
      query = query.eq(parentFilterCol, parentCode);
    }

    if (targetCodeCol === 'admin0_code') {
      query = query.not('admin0_code', 'is', null).is('admin1_code', null);
    } else if (targetCodeCol === 'admin1_code') {
      query = query.not('admin1_code', 'is', null).is('admin2_code', null);
    } else if (targetCodeCol === 'admin2_code') {
      query = query.not('admin2_code', 'is', null).is('admin3_code', null);
    } else if (targetCodeCol === 'admin3_code') {
      query = query.not('admin3_code', 'is', null).is('admin4_code', null);
    } else if (targetCodeCol === 'admin4_code') {
      query = query.not('admin4_code', 'is', null);
    }

    const { data, error } = await query.order('location_name', { ascending: true }).limit(1000);
    
    if (error) console.error(`Error fetching ${targetCodeCol}s:`, error);
    else setFunction(data);
  }
  // --- End Helper Function ---

  // Function to fetch and summarize global situation analysis data using LLM
  async function fetchSituationAnalysis() {
    setLoading(true);
    setDisplayedSummary('');
    setFullSummaryText('');
    setErrorMessage('');

    let textToSummarize = '';
    let summaryTitle = "Global Situation Analysis (Latest Alerts by Event Type)";
    let isFallback = false;

    try {
      // Check Supabase client authentication status
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log('Supabase Auth Session:', { sessionData, sessionError });

      // Log Supabase client configuration
      console.log('Supabase Client Config:', {
        url: supabase.supabaseUrl,
        key: supabase.supabaseKey ? 'Public key present' : 'No public key', // Avoid logging full key
      });

      // Fetch the most recent alert for each event_type using RPC
      const { data: alertsData, error: alertsError } = await supabase
        .rpc('get_latest_alerts_by_event_type');

      console.log('Supabase Query Result:', { alertsData, alertsError });

      if (alertsError) {
        console.error('Error fetching alerts:', alertsError.message, alertsError.details);
        setErrorMessage(`Failed to fetch recent alerts from database: ${alertsError.message}${alertsError.details ? ` (${alertsError.details})` : ''}. Fetching online data as fallback.`);
        isFallback = true;
      } else if (alertsData && alertsData.length > 0) {
        textToSummarize = alertsData.map(alert => 
          `${alert.alert_message || 'No message'} (Type: ${alert.event_type || 'Unknown'}, Location: ${alert.location_name || 'Global'}, Severity: ${alert.severity_level !== null ? alert.severity_level : 'N/A'}, Displaced: ${alert.displaced_people || 0}, Deaths: ${alert.deaths || 0}, Date: ${new Date(alert.ultimate_date).toLocaleString('en-US', { timeZone: 'UTC' })})`
        ).join('\n');
      } else {
        console.warn('No alerts found in database. Fetching online data as fallback.');
        setErrorMessage('No recent alerts available in database. Fetching online data as fallback.');
        isFallback = true;
      }

      if (isFallback) {
        summaryTitle = "Global Situation Analysis (Online Fallback Data)";
        // Use Gemini to fetch recent global alerts
        const prompt = `Search the web for recent global disaster or security alerts (e.g., floods, earthquakes, cyberattacks, geopolitical events) reported within the last week as of July 9, 2025. Provide a 3-4 line summary of up to 10 distinct events, including event type, location, and severity or impact where available. Limit to 4 lines maximum.`;

        let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = 'AIzaSyCwMqxRYB0JXOfVlbKtzbv-xC1EyHAEcgY'; // Gemini API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        console.log('LLM Fallback Response:', result);

        if (response.ok && result.candidates?.[0]?.content?.parts?.[0]?.text) {
          const text = result.candidates[0].content.parts[0].text.trim();
          setFullSummaryText(text);
          setSituationAnalysis([{ id: 1, title: summaryTitle, summary: text }]);
        } else {
          console.error('LLM Fallback Error:', result.error?.message || 'No valid response from LLM');
          setErrorMessage("Failed to fetch or summarize online alerts. No data available.");
          setSituationAnalysis([{ id: 1, title: summaryTitle, summary: "No recent global alerts available." }]);
          setFullSummaryText("No recent global alerts available.");
          setLoading(false);
          return;
        }
      } else {
        const prompt = `Provide a 3-4 line summary of the following global situation analysis text, limited to 4 lines maximum. Highlight the most repetitive event types observed, if any, and include key details like locations and severity levels where relevant:\n\n${textToSummarize}`;

        let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiKey = 'AIzaSyCwMqxRYB0JXOfVlbKtzbv-xC1EyHAEcgY'; // Gemini API key
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        console.log('LLM Response:', result);

        if (response.ok && result.candidates?.[0]?.content?.parts?.[0]?.text) {
          const text = result.candidates[0].content.parts[0].text.trim();
          setFullSummaryText(text);
          setSituationAnalysis([{ id: 1, title: summaryTitle, summary: text }]);
        } else {
          console.error('LLM Error:', result.error?.message || 'No valid response from LLM');
          setErrorMessage("Failed to generate summary. Displaying raw alert data.");
          setSituationAnalysis([{ id: 1, title: summaryTitle, summary: textToSummarize }]);
          setFullSummaryText(textToSummarize); // Fallback to raw alert data
        }
      }
    } catch (error) {
      console.error("Situation analysis error:", error);
      setErrorMessage("Failed to load situation analysis: " + error.message + ". Fetching online data as fallback.");
      summaryTitle = "Global Situation Analysis (Online Fallback Data)";

      // Fallback to online data
      const prompt = `Search the web for recent global disaster or security alerts (e.g., floods, earthquakes, cyberattacks, geopolitical events) reported within the last week as of July 9, 2025. Provide a 3-4 line summary of up to 10 distinct events, including event type, location, and severity or impact where available. Limit to 4 lines maximum.`;

      let chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = { contents: chatHistory };
      const apiKey = 'AIzaSyCwMqxRYB0JXOfVlbKtzbv-xC1EyHAEcgY'; // Gemini API key
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        console.log('LLM Fallback Response (catch block):', result);

        if (response.ok && result.candidates?.[0]?.content?.parts?.[0]?.text) {
          const text = result.candidates[0].content.parts[0].text.trim();
          setFullSummaryText(text);
          setSituationAnalysis([{ id: 1, title: summaryTitle, summary: text }]);
        } else {
          console.error('LLM Fallback Error (catch block):', result.error?.message || 'No valid response from LLM');
          setErrorMessage("Failed to fetch or summarize online alerts. No data available.");
          setSituationAnalysis([{ id: 1, title: summaryTitle, summary: "No recent global alerts available." }]);
          setFullSummaryText("No recent global alerts available.");
        }
      } catch (fallbackError) {
        console.error('Fallback fetch error:', fallbackError);
        setErrorMessage("Failed to fetch online alerts: " + fallbackError.message);
        setSituationAnalysis([{ id: 1, title: summaryTitle, summary: "No recent global alerts available." }]);
        setFullSummaryText("No recent global alerts available.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Typewriter effect for the summary
  useEffect(() => {
    if (fullSummaryText) {
      let i = 0;
      setDisplayedSummary('');
      const typingInterval = setInterval(() => {
        setDisplayedSummary((prev) => prev + fullSummaryText.charAt(i));
        i++;
        if (i === fullSummaryText.length) {
          clearInterval(typingInterval);
        }
      }, 30);

      return () => clearInterval(typingInterval);
    }
  }, [fullSummaryText]);

  // Fetch initial data: languages, countries, and situation analysis
  useEffect(() => {
    async function fetchInitialDataAndAnalysis() {
      const { data: langData, error: langError } = await supabase
        .from('languages')
        .select('code, name');
      if (langError) {
        console.error('Error fetching languages:', langError);
      } else {
        setLanguages(langData);
      }

      fetchAdminLevels('admin0_code', null, setCountries, null);
      fetchSituationAnalysis();
    }
    fetchInitialDataAndAnalysis();
  }, []);

  // --- Cascading Dropdowns for Location ---
  useEffect(() => {
    fetchAdminLevels('admin1_code', formData.country, setAdmin1s, 'admin0_code');
    const resetLowerLevels = () => setFormData(prev => ({ ...prev, admin1_code: '', admin2_code: '', admin3_code: '', admin4_code: '' }));
    if (formData.country !== '') {
      resetLowerLevels();
    }
  }, [formData.country]);

  useEffect(() => {
    fetchAdminLevels('admin2_code', formData.admin1_code, setAdmin2s, 'admin1_code');
    const resetLowerLevels = () => setFormData(prev => ({ ...prev, admin2_code: '', admin3_code: '', admin4_code: '' }));
    if (formData.admin1_code !== '') {
      resetLowerLevels();
    }
  }, [formData.admin1_code]);

  useEffect(() => {
    fetchAdminLevels('admin3_code', formData.admin2_code, setAdmin3s, 'admin2_code');
    const resetLowerLevels = () => setFormData(prev => ({ ...prev, admin3_code: '', admin4_code: '' }));
    if (formData.admin2_code !== '') {
      resetLowerLevels();
    }
  }, [formData.admin2_code]);

  useEffect(() => {
    fetchAdminLevels('admin4_code', formData.admin3_code, setAdmin4s, 'admin3_code');
    const resetLowerLevels = () => setFormData(prev => ({ ...prev, admin4_code: '' }));
    if (formData.admin3_code !== '') {
      resetLowerLevels();
    }
  }, [formData.admin3_code]);
  // --- End Cascading Dropdowns ---

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSuccessMessage('');
    setErrorMessage('');
  };

  const handleGeolocation = async () => {
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_GEOCODING_API_KEY}`
            );
            const data = await response.json();

            if (data.status === 'OK' && data.results.length > 0) {
              const addressComponents = data.results[0].address_components;
              let geoData = {
                country: '',
                admin1_code: '',
                admin2_code: '',
                admin3_code: '',
                admin4_code: '',
              };

              for (const component of addressComponents) {
                if (component.types.includes('country')) {
                  geoData.country = component.short_name;
                } else if (component.types.includes('administrative_area_level_1')) {
                  geoData.admin1_code = component.short_name;
                } else if (component.types.includes('administrative_area_level_2')) {
                  geoData.admin2_code = component.short_name;
                } else if (component.types.includes('locality') || component.types.includes('administrative_area_level_3')) {
                  geoData.admin3_code = component.short_name;
                } else if (component.types.includes('sublocality') || component.types.includes('neighborhood') || component.types.includes('administrative_area_level_4')) {
                  geoData.admin4_code = component.short_name;
                }
              }

              setFormData((prev) => ({
                ...prev,
                country: geoData.country,
                admin1_code: geoData.admin1_code,
                admin2_code: geoData.admin2_code,
                admin3_code: geoData.admin3_code,
                admin4_code: geoData.admin4_code,
              }));
              setSuccessMessage('Location detected successfully!');
            } else {
              setErrorMessage('Could not geocode your location.');
            }
          } catch (error) {
            console.error('Error during geocoding:', error);
            setErrorMessage('Error detecting location. Please try again or enter manually.');
          } finally {
            setLoading(false);
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          setErrorMessage('Geolocation permission denied or not available. Please enter your location manually.');
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setErrorMessage('Geolocation is not supported by your browser. Please enter your location manually.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    if (!formData.email || !formData.country || !formData.preferred_language_code) {
      setErrorMessage('Please fill in all required fields (Email, Country, Preferred Language).');
      setLoading(false);
      return;
    }

    try {
      const { data: existingSubscriber, error: fetchError } = await supabase
        .from('alert_subscribers')
        .select('id, is_subscribed')
        .eq('email', formData.email)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      let subscriberId;
      if (existingSubscriber) {
        const { data, error } = await supabase
          .from('alert_subscribers')
          .update({
            name: formData.name,
            surname: formData.surname,
            phone: formData.phone,
            country: formData.country,
            admin1_code: formData.admin1_code,
            admin2_code: formData.admin2_code,
            admin3_code: formData.admin3_code,
            admin4_code: formData.admin4_code,
            preferred_language_code: formData.preferred_language_code,
            is_subscribed: true,
          })
          .eq('id', existingSubscriber.id)
          .select()
          .single();

        if (error) throw error;
        subscriberId = data.id;
        setSuccessMessage('Your subscription has been updated!');
      } else {
        const { data, error } = await supabase
          .from('alert_subscribers')
          .insert({
            name: formData.name,
            surname: formData.surname,
            email: formData.email,
            phone: formData.phone,
            country: formData.country,
            admin1_code: formData.admin1_code,
            admin2_code: formData.admin2_code,
            admin3_code: formData.admin3_code,
            admin4_code: formData.admin4_code,
            preferred_language_code: formData.preferred_language_code,
            is_subscribed: true,
          })
          .select()
          .single();

        if (error) throw error;
        subscriberId = data.id;
        setSuccessMessage('Thank you for subscribing to The Sentinel System!');
      }

      try {
        console.log("DEBUG: Data saved to database, attempting to send email via Edge Function...");
        console.log("DEBUG: Edge Function URL:", RESEND_EMAIL_ENDPOINT);
        console.log("DEBUG: Email payload:", {
          email: formData.email,
          name: formData.name,
          language: formData.preferred_language_code,
          unsubscribeLink: `${window.location.origin}/unsubscribe?email=${encodeURIComponent(formData.email)}`
        });

        const emailResponse = await fetch(RESEND_EMAIL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            name: formData.name,
            language: formData.preferred_language_code,
            unsubscribeLink: `${window.location.origin}/unsubscribe?email=${encodeURIComponent(formData.email)}`
          }),
        });

        console.log("DEBUG: Email Function Response Status:", emailResponse.status);
        const emailData = await emailResponse.json();
        console.log("DEBUG: Email Function Response Data:", emailData);

        if (!emailResponse.ok) {
          throw new Error(emailData.error || 'Failed to send confirmation email.');
        }
        setSuccessMessage(prev => prev + ' A confirmation email has been sent!');
      } catch (emailError) {
        console.error('DEBUG: Error sending confirmation email (frontend fetch error):', emailError);
        setErrorMessage('However, there was an issue sending the confirmation email.');
      }

      setFormData({
        name: '',
        surname: '',
        email: '',
        phone: '',
        country: '',
        admin1_code: '',
        admin2_code: '',
        admin3_code: '',
        admin4_code: '',
        preferred_language_code: '',
      });
      setUseCurrentLocation(false);
    } catch (error) {
      console.error('Subscription error:', error);
      setErrorMessage(error.message || 'An unexpected error occurred during subscription.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageContainerStyle}>
      <style>
        {`
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes pulseGlow {
            0% { box-shadow: 0 0 10px rgba(0, 255, 255, 0.2); }
            50% { box-shadow: 0 0 20px rgba(0, 255, 255, 0.5), 0 0 30px rgba(0, 255, 255, 0.3); }
            100% { box-shadow: 0 0 10px rgba(0, 255, 255, 0.2); }
          }
        `}
      </style>

      <form onSubmit={handleSubmit} style={formStyle}>
        <img src="/logo.png" alt="World Disaster Center Logo" style={logoStyle} />
        <h2 style={headingStyle}>Subscribe to Michael Alerts</h2>

        {successMessage && <p style={successMessageStyle}>{successMessage}</p>}
        {errorMessage && <p style={errorMessageStyle}>{errorMessage}</p>}

        <div style={inputGroupStyle}>
          <label htmlFor="name" style={labelStyle}>Your Full Name:</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Sapiens"
            style={inputStyle}
          />
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="surname" style={labelStyle}>Your Surname (Optional):</label>
          <input
            type="text"
            id="surname"
            name="surname"
            value={formData.surname}
            onChange={handleChange}
            placeholder="e.g., Ndatabaye"
            style={inputStyle}
          />
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="email" style={labelStyle}>Your Email Address (for alerts):*</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="your.email@example.com"
            style={inputStyle}
          />
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="phone" style={labelStyle}>Your Phone Number (Optional, for SMS alerts):</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="e.g., +15551234567"
            style={inputStyle}
          />
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="preferred_language_code" style={labelStyle}>In which language would you like to receive alerts?:*</label>
          <select
            id="preferred_language_code"
            name="preferred_language_code"
            value={formData.preferred_language_code}
            onChange={handleChange}
            required
            style={selectStyle}
          >
            <option value="">Select Language</option>
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <h3 style={subHeadingStyle}>Your Alert Location Preference:</h3>
        <div style={checkboxGroupStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={useCurrentLocation}
              onChange={() => {
                setUseCurrentLocation(!useCurrentLocation);
                setErrorMessage('');
                setSuccessMessage('');
                if (!useCurrentLocation) {
                  handleGeolocation();
                } else {
                  setFormData(prev => ({ 
                    ...prev, 
                    country: '', admin1_code: '', admin2_code: '', admin3_code: '', admin4_code: '' 
                  }));
                }
              }}
              style={checkboxStyle}
            />
            Use My Current Location (Recommended for ease)
          </label>
        </div>

        {!useCurrentLocation && (
          <>
            <p style={italicTextStyle}>Or, tell us your preferred alert location manually:</p>
            <div style={inputGroupStyle}>
              <label htmlFor="country" style={labelStyle}>Country:*</label>
              <select
                id="country"
                name="country"
                value={formData.country}
                onChange={handleChange}
                required
                style={selectStyle}
              >
                <option value="">Select Country</option>
                {countries.map((country) => (
                  <option key={country.admin0_code} value={country.admin0_code}>
                    {country.location_name}
                  </option>
                ))}
              </select>
            </div>

            <div style={inputGroupStyle}>
              <label htmlFor="admin1_code" style={labelStyle}>Province/State (Admin Level 1):</label>
              <select
                id="admin1_code"
                name="admin1_code"
                value={formData.admin1_code}
                onChange={handleChange}
                disabled={!formData.country || admin1s.length === 0}
                style={selectStyle}
              >
                <option value="">Select Province/State</option>
                {admin1s.map((admin) => (
                  <option key={admin.admin1_code} value={admin.admin1_code}>
                    {admin.location_name}
                  </option>
                ))}
              </select>
            </div>

            <div style={inputGroupStyle}>
              <label htmlFor="admin2_code" style={labelStyle}>Region/County (Admin Level 2):</label>
              <select
                id="admin2_code"
                name="admin2_code"
                value={formData.admin2_code}
                onChange={handleChange}
                disabled={!formData.admin1_code || admin2s.length === 0}
                style={selectStyle}
              >
                <option value="">Select Region/County</option>
                {admin2s.map((admin) => (
                  <option key={admin.admin2_code} value={admin.admin2_code}>
                    {admin.location_name}
                  </option>
                ))}
              </select>
            </div>

            <div style={inputGroupStyle}>
              <label htmlFor="admin3_code" style={labelStyle}>City/District (Admin Level 3):</label>
              <select
                id="admin3_code"
                name="admin3_code"
                value={formData.admin3_code}
                onChange={handleChange}
                disabled={!formData.admin2_code || admin3s.length === 0}
                style={selectStyle}
              >
                <option value="">Select City/District</option>
                {admin3s.map((admin) => (
                  <option key={admin.admin3_code} value={admin.admin3_code}>
                    {admin.location_name}
                  </option>
                ))}
              </select>
            </div>

            <div style={inputGroupStyle}>
              <label htmlFor="admin4_code" style={labelStyle}>Neighborhood/Sub-district (Admin Level 4 - Optional):</label>
              <select
                id="admin4_code"
                name="admin4_code"
                value={formData.admin4_code}
                onChange={handleChange}
                disabled={!formData.admin3_code || admin4s.length === 0}
                style={selectStyle}
              >
                <option value="">Select Neighborhood/Sub-district</option>
                {admin4s.map((admin) => (
                  <option key={admin.admin4_code} value={admin.admin4_code}>
                    {admin.location_name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? <Loader /> : 'Subscribe to Michael Alerts'}
        </button>
      </form>

      <div style={situationAnalysisContainerStyle}>
        <h3 style={situationAnalysisHeadingStyle}>Global Situation Analysis</h3>
        {loading ? (
          <Loader />
        ) : (
          <ul style={situationAnalysisListStyle}>
            {situationAnalysis.length > 0 ? (
              <li key={situationAnalysis[0].id} style={situationAnalysisListItemStyle}>
                <h4 style={situationAnalysisItemTitleStyle}>{situationAnalysis[0].title}</h4>
                <p style={situationAnalysisItemSummaryStyle}>{displayedSummary}</p>
              </li>
            ) : (
              <p style={italicTextStyle}>No recent global situation analysis available.</p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Basic Inline Styles ---
const pageContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  maxWidth: '900px',
  margin: '50px auto',
  fontFamily: '"Roboto", sans-serif',
  padding: '20px',
  boxSizing: 'border-box',
  backgroundColor: '#0a192f',
  color: '#e0e0e0',
  borderRadius: '12px',
  boxShadow: '0 15px 40px rgba(0, 255, 255, 0.1), 0 0 20px rgba(0, 255, 255, 0.05)',
  position: 'relative',
  overflow: 'hidden',
};
pageContainerStyle['&::before'] = {
  content: '""',
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: 'linear-gradient(45deg, #0a192f, #003366, #0a192f)',
  backgroundSize: '200% 200%',
  animation: 'gradientShift 20s ease infinite',
  zIndex: -1,
  opacity: 0.7,
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
  padding: '30px',
  border: '1px solid rgba(0, 255, 255, 0.2)',
  borderRadius: '10px',
  maxWidth: '500px',
  width: '100%',
  boxShadow: '0 0 20px rgba(0, 255, 255, 0.1)',
  backgroundColor: 'rgba(18, 30, 50, 0.8)',
  marginBottom: '40px',
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
};

const headingStyle = {
  fontSize: '2.2em',
  color: '#00bfff',
  textAlign: 'center',
  marginBottom: '20px',
  fontWeight: '600',
  textShadow: '0 0 8px rgba(0, 255, 255, 0.5)',
};

const subHeadingStyle = {
  fontSize: '1.5em',
  color: '#00bfff',
  marginTop: '25px',
  marginBottom: '15px',
  fontWeight: '500',
  borderBottom: '1px solid rgba(0, 255, 255, 0.3)',
  paddingBottom: '10px',
  textShadow: '0 0 5px rgba(0, 255, 255, 0.3)',
};

const inputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
};

const labelStyle = {
  marginBottom: '8px',
  fontWeight: 'bold',
  color: '#b0e0e6',
  fontSize: '0.95em',
};

const inputStyle = {
  padding: '12px',
  border: '1px solid #00bfff',
  borderRadius: '6px',
  fontSize: '1em',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  color: '#e0e0e0',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  '&:focus': {
    borderColor: '#00ffff',
    boxShadow: '0 0 0 4px rgba(0, 255, 255, 0.3)',
    outline: 'none',
  },
};

const selectStyle = {
  ...inputStyle,
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  cursor: 'pointer',
};

const buttonStyle = {
  padding: '14px 25px',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontSize: '1.15em',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'background-color 0.3s ease, transform 0.1s ease, box-shadow 0.3s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  boxShadow: '0 5px 15px rgba(0, 123, 255, 0.3)',
  '&:hover': {
    backgroundColor: '#0056b3',
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 20px rgba(0, 123, 255, 0.4)',
  },
  '&:active': {
    transform: 'translateY(0)',
    boxShadow: 'none',
  },
  '&:disabled': {
    backgroundColor: '#cccccc',
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
};

const successMessageStyle = {
  color: '#76e676',
  fontWeight: 'bold',
  textAlign: 'center',
  backgroundColor: 'rgba(40, 167, 69, 0.2)',
  padding: '12px',
  borderRadius: '6px',
  border: '1px solid #28a745',
  marginBottom: '15px',
};

const errorMessageStyle = {
  color: '#ff6b6b',
  fontWeight: 'bold',
  textAlign: 'center',
  backgroundColor: 'rgba(220, 53, 69, 0.2)',
  padding: '12px',
  borderRadius: '6px',
  border: '1px solid #dc3545',
  marginBottom: '15px',
};

const checkboxGroupStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '15px',
};

const checkboxLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  color: '#b0e0e6',
};

const checkboxStyle = {
  marginRight: '8px',
  transform: 'scale(1.1)',
  accentColor: '#00bfff',
};

const logoStyle = {
  maxWidth: '180px',
  height: 'auto',
  margin: '0 auto 25px auto',
  display: 'block',
  filter: 'drop-shadow(0 0 10px rgba(0, 255, 255, 0.5))',
};

const italicTextStyle = {
  fontStyle: 'italic',
  color: '#a0a0a0',
  fontSize: '0.9em',
  textAlign: 'center',
};

const situationAnalysisContainerStyle = {
  width: '100%',
  padding: '30px',
  border: '1px solid rgba(0, 255, 255, 0.2)',
  borderRadius: '10px',
  boxShadow: '0 0 20px rgba(0, 255, 255, 0.1)',
  backgroundColor: 'rgba(18, 30, 50, 0.8)',
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
};

const situationAnalysisHeadingStyle = {
  fontSize: '2em',
  color: '#00bfff',
  textAlign: 'center',
  marginBottom: '25px',
  fontWeight: '600',
  textShadow: '0 0 8px rgba(0, 255, 255, 0.5)',
};

const situationAnalysisListStyle = {
  listStyle: 'none',
  padding: '0',
  margin: '0',
};

const situationAnalysisListItemStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(0, 255, 255, 0.1)',
  borderRadius: '8px',
  padding: '15px',
  marginBottom: '15px',
  boxShadow: '0 2px 8px rgba(0, 255, 255, 0.05)',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  '&:hover': {
    transform: 'translateY(-3px)',
    boxShadow: '0 5px 15px rgba(0, 255, 255, 0.2)',
  },
};

const situationAnalysisItemTitleStyle = {
  fontSize: '1.3em',
  color: '#00bfff',
  marginBottom: '8px',
  fontWeight: '600',
  textShadow: '0 0 5px rgba(0, 255, 255, 0.3)',
};

const situationAnalysisItemSummaryStyle = {
  fontSize: '0.95em',
  color: '#e0e0e0',
  lineHeight: '1.6',
};