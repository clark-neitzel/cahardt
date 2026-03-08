const axios = require('axios');
async function run() {
  const url = 'http://172.18.0.1:5100/trip/v1/driving/-48.910,-26.13;-48.85,-26.02;-48.86,-26.00?roundtrip=false&source=first&destination=last';
  try {
    const res = await axios.get(url);
    console.log(res.data.code);
  } catch(e) {
    console.log(e.response?.data);
  }
}
run();
