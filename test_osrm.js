const axios = require('axios');
async function test() {
  try {
    const res = await axios.get("http://172.18.0.1:5100/trip/v1/driving/-48.91411019396019,-26.13370014890912;-48.859757,-26.02911;-48.86658679665205,-26.005697328197897?source=first&destination=last");
    console.log("OK", Object.keys(res.data));
  } catch(e) {
    console.log("Erro", e.message, e.response?.data);
  }
}
test();
