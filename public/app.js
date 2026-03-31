const gun = Gun("http://localhost:8765/gun");

const notes = gun.get("notes");

function saveNote(){

const text = document.getElementById("noteInput").value;

notes.set({
text:text,
time:Date.now()
});

document.getElementById("noteInput").value="";
}

notes.map().on(function(note){

if(!note.text) return;

const li = document.createElement("li");
li.textContent = note.text;

document.getElementById("notes").appendChild(li);

});
