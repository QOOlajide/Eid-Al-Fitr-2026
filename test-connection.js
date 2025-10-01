// Simple script to test backend-frontend connection
const axios = require('axios');

async function testConnection() {
  console.log('🔍 Testing Backend-Frontend Connection...\n');

  const backendUrl = 'http://localhost:5000';
  const frontendUrl = 'http://localhost:3000';

  try {
    // Test 1: Backend Health Check
    console.log('1. Testing Backend Health...');
    const healthResponse = await axios.get(`${backendUrl}/health`);
    console.log('✅ Backend is running:', healthResponse.data);
  } catch (error) {
    console.log('❌ Backend is not running:', error.message);
    console.log('   Make sure to run: npm run server');
    return;
  }

  try {
    // Test 2: Frontend Accessibility
    console.log('\n2. Testing Frontend...');
    const frontendResponse = await axios.get(frontendUrl);
    console.log('✅ Frontend is running (status:', frontendResponse.status + ')');
  } catch (error) {
    console.log('❌ Frontend is not running:', error.message);
    console.log('   Make sure to run: npm run client');
    return;
  }

  try {
    // Test 3: API Endpoint (through proxy)
    console.log('\n3. Testing API through Frontend Proxy...');
    const apiResponse = await axios.get(`${frontendUrl}/api/events`);
    console.log('✅ API connection working:', apiResponse.status);
  } catch (error) {
    console.log('❌ API connection failed:', error.message);
  }

  try {
    // Test 4: WebSocket Connection
    console.log('\n4. Testing WebSocket Connection...');
    const io = require('socket.io-client');
    const socket = io(backendUrl);
    
    socket.on('connect', () => {
      console.log('✅ WebSocket connected:', socket.id);
      socket.disconnect();
    });

    socket.on('connect_error', (error) => {
      console.log('❌ WebSocket connection failed:', error.message);
    });

    // Wait a bit for connection
    setTimeout(() => {
      if (!socket.connected) {
        console.log('❌ WebSocket connection timeout');
      }
    }, 3000);

  } catch (error) {
    console.log('❌ WebSocket test failed:', error.message);
  }

  console.log('\n🎉 Connection test completed!');
}

// Run the test
testConnection();
