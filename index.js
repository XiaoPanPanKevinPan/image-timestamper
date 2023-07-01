import { zip } from "./zip.js";
const blobToDataURL = async blob => 
	new Promise((res, rej) => {
		let r = new FileReader();
		r.addEventListener(
			"load", 
			e => res(e.target.result)
		);
		r.addEventListener("error", rej);
		r.addEventListener("abort", rej);
		r.readAsDataURL(blob);
	});

const
	qry = (...x) => document.querySelector(...x),
	qrys = (...x) => document.querySelectorAll(...x);

/* Configure Drag & Drop */
// Source: https://stackoverflow.com/a/38968948/10596093

// dragover and dragenter events need to have 'preventDefault' called
// in order for the 'drop' event to register. 
// See: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#specifying_drop_targets
qry(`label[for="source"]`).addEventListener("dragover", e => e.preventDefault());
qry(`label[for="source"]`).addEventListener("dragenter", e => e.preventDefault());
qry(`label[for="source"]`).addEventListener("drop", e => {
	e.preventDefault();
	qry("#source").files = e.dataTransfer.files;
	qry("#source").dispatchEvent(new Event("change"));
});

// create editors when new files are selected
qry("#source").addEventListener("change", e => {
	for(let f of e.target.files) createEditor(f); // createEditor() is defined later
});

// Some of the code are copied from geeksforgeeks 
// Source: https://www.geeksforgeeks.org/creating-a-simple-image-editor-using-javascript/
let fileNameList = [];
const createEditor = (file) => {
	let editor = document.createElement("div");
	qry("#editors").appendChild(editor);
	editor.classList.add("editor");
	
	// Prevent files with the same filename being imported
	// as that makes it difficult to export in batches
	if(fileNameList.includes(file.name)) {
		editor.innerHTML = `
			Error: A file with the same name <code>${file.name}</code> has been imported.
			Please check again.

			<button>Close</button>
		`;
		editor.children[1].addEventListener("click", () => editor.remove());
	} else {
		fileNameList.push(file.name);
		let mainFilename = file.name.slice(0, file.name.lastIndexOf('.'));
		editor.innerHTML = `
			<div class="filename flex">${file.name}</div>
			<img src="" style="display: none;" crossorigin="anonymous" />
			<div class="canvasContainer">
				<canvas class="canvas"></canvas>
			</div>
			<div class="details padding flex gap"></div>
			<div class="flex padding gap">
				<a class="download button mainBtn" download="${mainFilename}_timestamped.jpg" href="">Download</a>
				<button class="close">Close</button>
			</div>
		`;
		const [
			filenameDiv, // No need to be configured
			sourceImg,
			{ children: [outputCanvas] },
			details,
			{ children: [
				downloadA,
				closeBtn
			] }
		] = editor.children;

		// set up the button for closing the editor
		closeBtn.addEventListener("click", e => {
			// clean the filename from the list
			fileNameList = fileNameList.filter(e => e != file.name); 
			// and remove the editor
			editor.remove();
		});

		// load image into sourceImg
		sourceImg.src = URL.createObjectURL(file);
		
		// if image is successfully loaded
		sourceImg.addEventListener("load", async ()=>{
			// get date info
			let dateString = "";
			dateString = await new Promise(res => {
				EXIF.getData(sourceImg, function() {
					let dateString =
						EXIF.getTag(this, "DateTime")
						|| EXIF.getTag(this, "DateTimeOriginal")
						|| EXIF.getTag(this, "DateTimeDigitized")
						|| "";
					if(dateString.match(/^.{4}(:.{2}){2} .{2}(:.{2}){2}$/)) {
						let [year, month, day, hour, min, sec] 
							= dateString.replace(/:/g, " ").split(" ");
						res(`${year}/${month}/${day} ${hour}:${min}:${sec}`);
					} else {
						res("xxxx/xx/xx xx:xx:xx");
					}
				})
			});

			// setup details for render
			details.innerHTML = `
				<div>
					<span>Text: </span>
					<input type="text" placeholder="Input New Text Here" aria-label="timestamp text" value="${dateString}" />
				</div>
				<div>
					<span>Color: </span>
					<input type="color" value="#eb9b35" aria-label="timestamp main color" />
				</div>
				<div>
					<span>Stroke:</span>
					<input type="color" value="#2e1c05" aria-label="timestamp stroke color">
				</div>
			`;
			const [
				{ children: [tsTextSpan, tsTextInput] },
				{ children: [tsColorSpan, tsColorInput] },
				{ children: [tsStrokeColorSpan, tsStrokeColorInput]}
			] = details.children;

			// draw the canvas
			const draw = async () => {
				let
					w = outputCanvas.width = sourceImg.naturalWidth,
					h = outputCanvas.height = sourceImg.naturalHeight;
				outputCanvas.crossOrigin = "anonymous";

				let 
					em = Math.min(w * 0.05, h * 0.05),
					padding = em;

				let context = outputCanvas.getContext("2d");

				Object.assign(context, {
					textAlign: "end",
					baseline: "bottom",
					font: `${em}px "Sarasa Mono Slab TC", "Sarasa Mono Slab J", sans-serif`,
					strokeStyle: tsStrokeColorInput.value,
					lineWidth: 0.1 * em,
					fillStyle: tsColorInput.value
				});

				await document.fonts.load(context.font);

				context.drawImage(sourceImg, 0, 0);
				context.strokeText(tsTextInput.value, w - padding, h - padding, w - em);
				context.fillText(tsTextInput.value, w - padding, h - padding, w - em);
			}

			// generateDownload
			const generateDownload = () => {
				downloadA.href = outputCanvas.toDataURL("image/jpeg");
			}
			draw().then(generateDownload);

			// once the details changed, redraw
			[...details.children].forEach(
				e => e.addEventListener("change", () => draw().then(generateDownload))
			);
		});

		// if error occurs while the image loading
		sourceImg.addEventListener("error", ()=>{
			[sourceImg, outputCanvas, downloadBtn].forEach(e => e.remove());
			details.innerHTML = `
				Error: The image's file type may not be supported, or the file is corrupted.
			`;
		});

	}

}

// setup the button to close all editors
qry("#clearAll").addEventListener(
	"click", 
	e => [...qrys("#editors .editor button.close")].forEach(e => e.click())
);

// setup the button to download all
qry("#downloadAll").addEventListener("click", async e => {
	let editors = [...qrys("#editors .editor")];
	let files = [];
	for(let editor of editors){
		let imgBlob = await new Promise(
			res => editor.querySelector(".canvas")?.toBlob(res, "image/jpeg")
		) || null;
		let filename = editor.querySelector("a.download")?.download || "";
		if(imgBlob == null || filename == "") continue;

		files.push({
			name: filename,
			data: new Uint8Array(await imgBlob.arrayBuffer())
		});
	}

	if(files.length == 0) return alert("Please select files at first.");
	
	blobToDataURL(zip(files))
	.then(str => {
		let a = document.createElement("a");
		document.body.appendChild(a);
		a.style["display"] = "none";

		a.href = str;
		let now = new Date();
		a.download = `timestampedImages_${now.toISOString()}`;

		a.click();
		// a.remove();
	})
	.catch(e => {
		alert("An error occurred while preparing for downloading.");
		console.log("Error", e);
	})
})

