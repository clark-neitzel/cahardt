const axios = require('axios');
async function run() {
  const url = 'http://172.18.0.1:5000/trip/v1/driving/-48.9141,-26.1337;-48.8597,-26.0291;-48.8665,-26.0056;-48.9107,-26.1899?roundtrip=false&source=first';
  try {
    const res = await axios.get(url);
    console.log(res.data.code);
  } catch(e) {
    console.log("ERRO", e.response?.data);
  }
}
run();
