let
    names=["Minsk","Homyel","Vitebsk","Hrodna","Mahilyow","Brest"],
    normnames=["Minsk","Gomel","Vitebsk","Grodno","Mogilev","Brest"],
    url = "https://api.openweathermap.org/data/2.5/weather?q=",
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
    brest = document.getElementById("brest");

function getelem(x,y) {
    let request = new XMLHttpRequest();
    request.addEventListener("load", x);
    request.open("GET", y, true);
    request.responseType = "json";
    request.send("");
}
function change(city) {
    return function () {
        for (let i = 0; i < names.length; i++) {
            if (this.response.name === names[i]) {
                names[i] = normnames[i];
                weather = this.response.weather[0].main;
                temp = (Math.round(this.response.main.temp - 273.15));
                city.value = "City: " + names[i] + "\nWeather: " + weather + "\nTemp: " + temp + "°C"
            }
        }
    }
}

getelem(change(gomel),gomelurl);
getelem(change(minsk),minskurl);
getelem(change(vitebsk),vitebskurl);
getelem(change(mogilev),mogilevurl);
getelem(change(grodno),grodnourl);
getelem(change(brest),bresturl);

