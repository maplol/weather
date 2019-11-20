let url = "https://api.openweathermap.org/data/2.5/weather?q=",
    gomelurl= url+"homyel&APPID=a8de50e25c5a720cf60c585bda8206d6",
    minskurl = url+"minsk&APPID=a8de50e25c5a720cf60c585bda8206d6",
    vitebskurl = url +"vitebsk&APPID=a8de50e25c5a720cf60c585bda8206d6",
    mogilevurl = url +"mahilyow&APPID=a8de50e25c5a720cf60c585bda8206d6",
    grodnourl = url +"hrodna&APPID=a8de50e25c5a720cf60c585bda8206d6",
    bresturl = url + "brest&APPID=a8de50e25c5a720cf60c585bda8206d6",

    gomel = document.getElementById("gomel"),
    minsk = document.getElementById("minsk"),
    vitebsk = document.getElementById("vitebsk"),
    mogilev = document.getElementById("mogilev"),
    grodno = document.getElementById("grodno"),
    brest = document.getElementById("brest"),
    name,weather,temp;

function getelem(x,y) {
    let request = new XMLHttpRequest();
    request.addEventListener("load", x);
    request.open("GET", y, true);
    request.responseType = "json";
    request.send("");
}
function change(city) {
    name = this.response.name;
    weather = this.response.weather[0].main;
    temp = (Math.round(this.response.main.temp - 273.15));
    city.value =  "City: "+name +"\nWeather: "+weather+"\nTemp: "+ temp+ "°C"
}

getelem(change(gomel),gomelurl);
function changeInfominsk () {
    minsk.value = "City: "+name +"\nWeather: "+weather+"\nTemp: "+ temp+ "°C"
}
getelem(changeInfominsk,minskurl);

function changeInfovitebsk () {
    vitebsk.value =  "City: "+name +"\nWeather: "+weather+"\nTemp: "+ temp+ "°C"
}
getelem(changeInfovitebsk,vitebskurl);

function changeInfomogilev () {
    mogilev.value =  "City: "+name +"\nWeather: "+weather+"\nTemp: "+ temp+ "°C"
}
getelem(changeInfomogilev,mogilevurl);

function changeInfogrodno () {
    grodno.value =  "City: "+name +"\nWeather: "+weather+"\nTemp: "+ temp+ "°C"
}
getelem(changeInfogrodno,grodnourl);

function changeInfobrest () {
    brest.value =  "City: "+name +"\nWeather: "+weather+"\nTemp: "+ temp+ "°C"
}
getelem(changeInfobrest,bresturl);

