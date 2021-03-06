'use strict';

import { join as pathJoin } from 'path';
import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { is } from 'electron-util';
import unhandled from 'electron-unhandled';
import debug from 'electron-debug';
import contextMenu from 'electron-context-menu';
import { pathExists, unlink, writeFile, copyFile } from 'fs-extra';
import getPixels from 'get-pixels';
import { WaveFile } from 'wavefile';
import { tmpdir } from 'os';

import { ffmpeg } from './lib/ffmpeg';
import { SonifyNode } from './lib/sonifyNode';

//import config from './lib/config';
import { createMenu } from './lib/menu';
import { sox } from './lib/sox';

unhandled();
contextMenu();

if (is.development) {
	debug();
}

app.setAppUserModelId('spiritsinobjects');

if (!is.development) {
	  	const FOUR_HOURS = 1000 * 60 * 60 * 4;
 	setInterval(() => {
 		autoUpdater.checkForUpdates();
 	}, FOUR_HOURS);
}

async function pixels (filePath : string) {
	return new Promise((resolve : Function, reject : Function ) => {
		return getPixels(filePath, (err : Error, imageData : any) => {
			if (err) {
				return reject(err);
			}
			return resolve(imageData);
		});
	});
}

//autoUpdater.checkForUpdates();

let mainWindow : any;

const BrowserOptions = {
	title: app.name,
	show: false,
	width: 1000,
	height: 800,
	backgroundColor: 'rgb(220, 225, 220)',
	webPreferences : {
		nodeIntegration: true
	}
};

const createMainWindow = async () => {
	const win = new BrowserWindow(BrowserOptions);

	win.on('ready-to-show', () => {
		win.show();
	});

	win.on('closed', () => {
		mainWindow = undefined;
		app.quit();
	});

	await win.loadFile(pathJoin(__dirname, '../views/index.html'));

	return win;
};

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.on('second-instance', () => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}

		mainWindow.show();
	}
});

app.on('window-all-closed', () => {
	if (!is.macos) {
		app.quit();
	}
});

app.on('activate', async () => {
	if (!mainWindow) {
		mainWindow = await createMainWindow();
	}
});

ipcMain.on('sonify', async (evt : Event, args : any) => {
	const startTime : number = +new Date();

	let wav = new WaveFile();
	let tmp : any;
	let watcher : any;
	let sonify : SonifyNode;
	let filePath : string;
	let i : number = 0;
	let imageData : any;
	let arrBuffer : Float32Array;
	let endTime : number;
	let frameStart : number;
	let ms : number;
	let arr : Float32Array = new Float32Array(args.state.height * args.state.frames);
	let tmpExists : boolean = false;
	let tmpAudio : string;
	let normalAudio : string;
	
	console.log(args.state)

	try {
		tmp = await ffmpeg.exportPath();
		tmpExists = true;
	} catch (err) {
		console.error(err);
	}

	sonify = new SonifyNode(args.state);
	
	for (i = 0; i < args.state.frames; i++) {
		frameStart = +new Date();

		try {
			filePath = await ffmpeg.exportFrame(args.state.files[0], i);
		} catch (err) {
			console.error(err);
			continue;
		}

		try {
			tmpExists = await pathExists(filePath);
		} catch (err) {
			console.error(err);
			continue;
		}

		if (!tmpExists) {
			console.warn(`Frame ${filePath} does not exist`);
			continue
		}

		try {
			imageData = await pixels(filePath);
		} catch (err) {
			console.error(err);
			continue;
		}

		arrBuffer = sonify.sonify(imageData.data);

		ms = (+new Date()) - frameStart;
		//console.log(`progress : ${i / args.state.frames}`);
		mainWindow.webContents.send('sonify_progress', { i, frames : args.state.frames, ms });

		arr.set(arrBuffer, i * arrBuffer.length);

		try {
			unlink(filePath);
		} catch (err) {
			console.error(err);
		}

		arr.set(arrBuffer, i * arrBuffer.length);
	}

	console.log(`All frames exported and sonified for ${args.state.files[0]}`)

	wav.fromScratch(1, args.state.samplerate, '32f', arr);

	console.log('Created wav from raw sample data');

	tmpAudio = pathJoin(tmpdir(), 'tmp_audio.wav');
	normalAudio = pathJoin(tmpdir(), 'normal_audio.wav');

	try {
		await writeFile(tmpAudio, wav.toBuffer());
		console.log(`Saved temporary audio file to ${tmpAudio}`);
	} catch (err) {
		console.error(err);
	}

	try {
		//await sox.postProcess(tmpAudio, normalAudio);
		//console.log(`Normalized audio file to ${normalAudio}`);
	} catch (err) {
		console.error(err);
		console.log('Normalization failed, using original tmp file.');
		tmpAudio = normalAudio;
	}

	endTime = +new Date();
	mainWindow.webContents.send('sonify_complete', { time : endTime - startTime, tmpAudio : normalAudio });
});

ipcMain.on('info', async (evt : Event, args : any) => {
	let res : any;
	try {
		res = await ffmpeg.info(args.filePath)
	} catch (err) {
		console.error(err)
	}
	mainWindow.webContents.send('info', res);
});

ipcMain.on('save', async (evt : Event, args : any) => {
	if (args.savePath && !args.savePath.canceled) {
		try {
			await copyFile(args.filePath, args.savePath.filePath);
			console.log(`Saved file as ${args.savePath.filePath}`);
		} catch (err) {
			console.error(err);
		}
	}
});

(async () => {
	const menu = createMenu();
	await app.whenReady();
	Menu.setApplicationMenu(menu);
	mainWindow = await createMainWindow();
})();