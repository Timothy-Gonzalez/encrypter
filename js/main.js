let topDiv,
	topButtons,
	contentDiv,
	hint,
	hint2,
	activateButton,
	headerPart2,
	keywordInput,
	outputHint,
	inputInput,
	filePicker,
	filePickerText,
	fileCreator,
	fileCreatorNameInput,
	fileCreatorExtensionInput,
	fileCreatorInput,
	outputDiv,
	output,
	clipboardCopyText,
	mode,
	inputFileData,
	textButtons

const ENCRYPTED_EXTENSION = ".encrypter"
const GENERIC_ERROR_TEXT =
	"Failed to decrypt - make sure the input and keyword are correct!"

const ITERATIONS = 5_000
const GROUPING = 25
const SALT_CHARS = 16
const KEY_SIZE = 256 / 32
const IV_SIZE = 16

const AES_CONFIG = {
	mode: CryptoJS.mode.CTR,
	padding: CryptoJS.pad.AnsiX923,
}

const DISPLAYS = [
	{},
	{
		Title: "Encrypt a File",
		Hint: "Secret File → Encrypted File",
		Header2: "The Secret File",
		Hint2:
			"This should be the file you want to encrypt, like 'secretFile.txt'.<br>" +
			"If you don't have a file, you can also enter text which will be converted into one.",
		ActivateButton: "Encrypt File",
		OnClick: encryptFile,
		InputType: "File",
		AllowCreate: true,
	},
	{
		Title: "Decrypt a File",
		Hint: "Encrypted File → Secret File",
		Header2: "The Encrypted File",
		Hint2: `This should be the encrypted file, like 'secretFile.txt${ENCRYPTED_EXTENSION}'.`,
		ActivateButton: "Decrypt File",
		OnClick: decryptFile,
		InputType: "File",
		OnlyAcceptFile: ENCRYPTED_EXTENSION,
	},
	{
		LineBreak: true,
	},
	{
		Title: "Encrypt a Message",
		Hint: "Secret Text → AFGwIM=",
		Placeholder: "Enter text to encrypt...",
		Header2: "The Secret Message",
		Hint2:
			"This should be the message you want to encrypt, like 'The secret base is at (-573, 338)'.",
		ActivateButton: "Encrypt Message",
		OnClick: encryptText,
		InputType: "Text",
	},
	{
		Title: "Decrypt a Message",
		Hint: "AFGwIM= → Secret Text",
		Placeholder: "Enter text to decrypt...",
		Header2: "The Encrypted Message",
		Hint2: "This should be the encrypted message, like 'AFGwIM='.",
		ActivateButton: "Decrypt Message",
		OnClick: decryptText,
		InputType: "Text",
	},
]

const METHODS = {
	Encrypt: {
		Id: "Encrypt",
		WaitingText: "Encrypting...",
		DoneText: "Encrypted Message:",
		SerializeInput: false,
		LimitFileSaveToEncrypted: true,
		Function: encrypt,
		TransformFileName: (fileName) => {
			return fileName + ENCRYPTED_EXTENSION
		},
	},
	Decrypt: {
		Id: "Decrypt",
		WaitingText: "Decrypting...",
		DoneText: "Decrypted Message:",
		SerializeInput: true,
		LimitFileSaveToEncrypted: false,
		Function: decrypt,
		TransformFileName: (fileName) => {
			let lastIndex = fileName.lastIndexOf(ENCRYPTED_EXTENSION)
			let originalFileName = fileName.substring(0, lastIndex)

			//Handle case of someFile.txt (1).encrypted, where it would end up being someFile.txt (1), an invalid type
			let indexOfExtension = originalFileName.indexOf(".")
			if (indexOfExtension) {
				let indexOfSpace = originalFileName.indexOf(" ", indexOfExtension)
				if (indexOfSpace >= indexOfExtension) {
					originalFileName = originalFileName.substring(0, indexOfSpace)
				}
			}

			return originalFileName
		},
	},
}

let jobID = 0

let copyToClipboard = (function () {
	let clipboardCounter = 0
	return function () {
		window.getSelection().removeAllRanges()
		let textArea = document.createElement("textarea")
		textArea.innerText = output.innerText
		document.body.appendChild(textArea)

		textArea.select()
		textArea.setSelectionRange(0, 99999) /* For mobile devices */
		document.execCommand("copy")

		document.body.removeChild(textArea)

		clipboardCopyText.innerText = "Copied!"
		clipboardCounter++
		let saved = clipboardCounter
		setTimeout(function () {
			if (clipboardCounter === saved) {
				clipboardCopyText.innerText = "Copy to Clipboard"
			}
		}, 3000)
	}
})()

function setTextButtonsVisible(visible) {
	textButtons.style.display = visible ? "inline" : "none"
}

function updateInputFileData(blob, fileName) {
	blob.arrayBuffer().then((buffer) => {
		filePickerText.innerText = `Using: ${fileName}`

		inputFileData = {
			name: fileName,
			buffer: buffer,
		}
	})
}

function uploadFile() {
	let input = document.createElement("input")
	input.type = "file"

	//Limit file type
	const display = DISPLAYS[mode]
	const onlyAccept = display.OnlyAcceptFile
	if (onlyAccept) {
		input.accept = onlyAccept
	}

	input.onchange = (e) => {
		let file = e.target.files[0]

		if (onlyAccept && !file.name.endsWith(onlyAccept)) {
			return alert(
				`Invalid file type! Please make sure you upload a '${onlyAccept}' file.`
			)
		}

		updateInputFileData(file, file.name)
	}

	input.click()
}

function createFile() {
	fileCreator.style.display = "block"
	fileCreatorNameInput.value = ""
	fileCreatorExtensionInput.value = ""
	fileCreatorInput.value = ""
}

function finalizeCreateFile(confirm) {
	if (confirm) {
		const name = fileCreatorNameInput.value
		const extension = fileCreatorExtensionInput.value
		const input = fileCreatorInput.value

		if (name.length === 0) {
			return alert("Please specify a file name!")
		}

		if (extension.length === 0) {
			return alert("Please specify a file extension!")
		}

		const blob = new Blob([input])
		const fileName = name + "." + extension

		updateInputFileData(blob, fileName)
	}

	fileCreator.style.display = "none"
}

/**
 * Opens a save prompt for the provided file if possible, otherwise defaults to downloading the file
 *
 * @param {string} suggestedName The suggested file name to output as
 * @param {ArrayBuffer} content The content to be output
 * @param {boolean} limitToEncrypted If true, only files with the {@link ENCRYPTED_EXTENSION} will be shown
 * @param {string} id The id to remember the save file picker's last location as
 *
 * @returns {string} The result message to display
 */
async function outputFile(suggestedName, content, limitToEncrypted, id) {
	const a = document.createElement("a")

	const blob = new Blob([content])

	// Check save prompt support
	if ("showSaveFilePicker" in window) {
		const options = {
			suggestedName: suggestedName,
			startIn: "downloads",
			id: id,
		}

		if (limitToEncrypted) {
			options.types = [
				{
					description: "Encrypter file",
					accept: { "text/encrypter": ENCRYPTED_EXTENSION },
				},
			]
		}

		const handle = await showSaveFilePicker(options)

		const writable = await handle.createWritable()

		await writable.write(blob)

		await writable.close()

		return "Saved!"
	} else {
		// Revert to downloading instead
		const url = window.URL.createObjectURL(blob)
		a.setAttribute("href", url)
		a.setAttribute("download", suggestedName)
		a.click()
		window.URL.revokeObjectURL(url)

		return "Downloaded!"
	}
}

function generateSalt() {
	return CryptoJS.enc.Base64.parse(
		CryptoJS.lib.WordArray.random(100)
			.toString(CryptoJS.enc.Base64)
			.substring(0, SALT_CHARS)
	)
}

function generateKey(password, salt, keySize, on, last) {
	if (!on) {
		on = 0
	}

	if (!last) {
		last = new Date()
	}

	return new Promise(async (resolve) => {
		while (true) {
			if (on >= ITERATIONS) {
				resolve(password)
				return
			}

			password = CryptoJS.PBKDF2(password, salt, {
				keySize: keySize,
				iterations: GROUPING,
				hasher: CryptoJS.algo.SHA512,
			})
			on += GROUPING

			// Check for more than a frame passing
			if (new Date() - last > 15) {
				requestAnimationFrame(async () => {
					resolve(await generateKey(password, salt, keySize, on))
				})
				return
			}
		}
	})
}

function clearOutput() {
	outputDiv.style.display = "none"
	output.innerText = ""
	outputHint.innerText = ""
	setTextButtonsVisible(false)
}

function wordArrayToArrayBuffer(wordArray) {
	const length = wordArray.sigBytes
	const array = new Uint8Array(length)
	let arrayI = 0

	for (let i = 0; i < wordArray.words.length; i++) {
		const word = wordArray.words[i]

		array[arrayI++] = (word >>> 24) & 0xff
		if (arrayI == length) {
			break
		}
		array[arrayI++] = (word >>> 16) & 0xff
		if (arrayI == length) {
			break
		}
		array[arrayI++] = (word >>> 8) & 0xff
		if (arrayI == length) {
			break
		}
		array[arrayI++] = word & 0xff
		if (arrayI == length) {
			break
		}
	}

	return array.buffer
}

function encrypt(content, keyword) {
	return new Promise(async (resolve) => {
		const password = CryptoJS.enc.Utf8.parse(keyword)

		const salt = generateSalt()
		const key = await generateKey(password, salt, KEY_SIZE)
		const iv = await generateKey(key, salt, IV_SIZE)

		let wordArray

		if (typeof content == "string") {
			wordArray = CryptoJS.enc.Utf8.parse(content)
		} else {
			wordArray = CryptoJS.lib.WordArray.create(content)
		}

		const encrypted = CryptoJS.AES.encrypt(wordArray, key, {
			mode: AES_CONFIG.mode,
			padding: AES_CONFIG.padding,
			iv: iv,
		})
		const ciphertext = encrypted.ciphertext

		const resultString =
			salt.toString(CryptoJS.enc.Base64) +
			ciphertext.toString(CryptoJS.enc.Base64)
		const resultWordArray = CryptoJS.enc.Utf8.parse(resultString)

		const resultArrayBuffer = wordArrayToArrayBuffer(resultWordArray)

		resolve(resultArrayBuffer)
	})
}

async function decrypt(content, keyword) {
	if (typeof content != "string") {
		// We can use Utf8 here because we can assume ciphertext must be base64
		content = CryptoJS.lib.WordArray.create(content).toString(CryptoJS.enc.Utf8)
	}

	const salt = CryptoJS.enc.Base64.parse(content.substring(0, SALT_CHARS))
	const ciphertext = CryptoJS.enc.Base64.parse(content.substring(SALT_CHARS))

	const password = CryptoJS.enc.Utf8.parse(keyword)

	const key = await generateKey(password, salt, KEY_SIZE)
	const iv = await generateKey(key, salt, IV_SIZE)

	const decrypted = CryptoJS.AES.decrypt(
		CryptoJS.lib.CipherParams.create({
			ciphertext: ciphertext,
		}),
		key,
		{
			mode: AES_CONFIG.mode,
			padding: AES_CONFIG.padding,
			iv: iv,
		}
	)

	const result = wordArrayToArrayBuffer(decrypted)

	if (result && result.byteLength > 0) {
		return result
	} else {
		throw new Error("No output")
	}
}

function getKeyword() {
	const keyword = keywordInput.value

	if (keyword.length === 0) {
		alert("Enter a keyword!")
		return
	}

	return keyword
}

// Removes whitespace from input, typically for when encrypted text should have no whitespace
function serializeInput(input) {
	return input.replace(/[\s\n\r]/g, "")
}

function getTextInput(serialize) {
	let input = inputInput.value

	if (serialize) {
		input = serializeInput(input)
	}

	if (input.length === 0) {
		alert("Enter input text!")
		return
	}

	return input
}

function outputText(header, content) {
	clearOutput()

	outputHint.innerText = header
	if (content) {
		outputDiv.style.display = "block"
		output.innerText = content
		setTextButtonsVisible(true)
	}
}

function handleEyeButton(button, visible) {
	button
		.querySelector("use")
		.setAttribute("href", "res/defs.svg" + (visible ? "#eye_slashed" : "#eye"))

	button.querySelector("p").innerText = visible ? "Hide" : "Show"
}

function changeKeywordVisibility() {
	const currentVisible = keywordInput.getAttribute("type") == "text"
	const newVisible = !currentVisible
	keywordInput.setAttribute("type", newVisible ? "text" : "password")

	handleEyeButton(document.getElementById("keywordVisibility"), newVisible)
}

function changeOutputVisibility() {
	const currentVisible = outputDiv.getAttribute("data-visible") == "true"
	const newVisible = !currentVisible
	outputDiv.setAttribute("data-visible", newVisible)

	handleEyeButton(document.getElementById("outputVisibility"), newVisible)
}

function handleTextMethod(method) {
	jobID++
	const thisJobId = jobID

	const keyword = getKeyword()
	if (!keyword) {
		return
	}

	const input = getTextInput(method.SerializeInput)
	if (!input) {
		return
	}

	outputText(method.WaitingText)

	method
		.Function(input, keyword)
		.then((resultArrayBuffer) => {
			if (jobID != thisJobId) {
				return
			}

			const wordArray = CryptoJS.lib.WordArray.create(resultArrayBuffer)
			const resultString = wordArray.toString(CryptoJS.enc.Utf8)

			outputText(method.DoneText, resultString)
		})
		.catch((error) => {
			if (jobID != thisJobId) {
				return
			}

			outputText(GENERIC_ERROR_TEXT)
			console.error(error)
		})
}

function encryptText() {
	handleTextMethod(METHODS.Encrypt)
}

function decryptText() {
	handleTextMethod(METHODS.Decrypt)
}

function checkInputFileData() {
	if (!inputFileData) {
		alert("Please upload or create a file to encrypt!")
		return
	}
	return true
}

function handleFileMethod(method) {
	jobID++
	const thisJobId = jobID

	const keyword = getKeyword()
	if (!keyword) {
		return
	}

	if (!checkInputFileData()) {
		return
	}

	const input = inputFileData.buffer
	const fileName = inputFileData.name

	outputText(method.WaitingText)

	method
		.Function(input, keyword)
		.then(async (result) => {
			if (jobID != thisJobId) {
				return
			}

			const resultFileName = method.TransformFileName(fileName)
			outputFile(
				resultFileName,
				result,
				method.LimitFileSelectionToEncrypted,
				method.Id
			)
				.then(outputText)
				.catch(() => outputText("Save canceled."))
		})
		.catch((error) => {
			if (jobID != thisJobId) {
				return
			}

			outputText(GENERIC_ERROR_TEXT)
			console.error(error)
		})
}

function encryptFile() {
	handleFileMethod(METHODS.Encrypt)
}

function decryptFile() {
	handleFileMethod(METHODS.Decrypt)
}

function createDisplayButtons() {
	for (let i = 1; i < DISPLAYS.length; i++) {
		const display = DISPLAYS[i]

		if (!display.LineBreak) {
			const button = document.createElement("button")
			button.setAttribute("class", "topButton")
			button.setAttribute("onclick", `changeMenu(${i})`)
			button.innerText = display.Title

			const smallInfo = document.createElement("p")
			smallInfo.setAttribute("class", "smallInfo")
			smallInfo.innerText = display.Hint

			button.appendChild(smallInfo)
			topButtons.appendChild(button)
		} else {
			topButtons.appendChild(document.createElement("br"))
		}
	}
}

function changeMenu(num) {
	clearOutput()
	inputInput.value = ""
	inputFileData = null
	mode = num

	if (num > 0) {
		//Not main menu

		// Prevent further display of intro animation
		document.body.classList.remove("playIntroAnimation")

		//Get display
		const display = DISPLAYS[num]

		//Set display
		topDiv.style.display = "none"
		contentDiv.style.display = "block"

		//Set specific properties
		if (display.InputType === "Text") {
			filePicker.style.display = "none" //Hide file picker
			inputInput.style.display = "" //Allow default display of input, shown

			inputInput.placeholder = display.Placeholder
		} else if (display.InputType === "File") {
			filePicker.style.display = "" //Allow default display of file picker, shown
			inputInput.style.display = "none" //Hide input

			filePickerText.innerText = "No file uploaded"

			if (display.AllowCreate) {
				filePicker.classList.add("allowCreate")
			} else {
				filePicker.classList.remove("allowCreate")
			}
		}

		hint.innerHTML = display.Hint
		headerPart2.innerText = display.Header2
		hint2.innerHTML = display.Hint2
		activateButton.innerText = display.ActivateButton
		activateButton.onclick = display.OnClick
	} else {
		//Main menu
		topDiv.style.display = "block"
		contentDiv.style.display = "none"
	}
}

function onLoad() {
	topDiv = document.getElementById("top")
	topButtons = document.getElementById("topButtons")
	contentDiv = document.getElementById("content")
	hint = document.getElementById("hint")
	hint2 = document.getElementById("hint2")
	activateButton = document.getElementById("activateButton")
	headerPart2 = document.getElementById("headerPart2")
	keywordInput = document.getElementById("keyword")
	inputInput = document.getElementById("input")
	filePicker = document.getElementById("filePicker")
	filePickerText = document.getElementById("filePickerText")
	fileCreator = document.getElementById("fileCreator")
	fileCreatorNameInput = document.getElementById("fileCreatorNameInput")
	fileCreatorExtensionInput = document.getElementById(
		"fileCreatorExtensionInput"
	)
	fileCreatorInput = document.getElementById("fileCreatorInput")
	outputDiv = document.getElementById("output")
	output = outputDiv.querySelector("p")
	outputHint = document.getElementById("outputHint")
	clipboardCopyText = document
		.getElementById("clipboardCopy")
		.querySelector("p")
	textButtons = document.getElementById("textButtons")

	pairing = ""
	for (let i = 33; i <= 126; i++) {
		pairing += String.fromCharCode(i)
	}

	//Create display buttons
	createDisplayButtons()

	//Set menu to default
	changeMenu(0)
}
