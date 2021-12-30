import { Presence } from 'discord-rpc';
import { getConfig } from './config';
import { debug, DiagnosticSeverity, env, languages, Selection, TextDocument, window, workspace } from 'vscode';
import {
	CONFIG_KEYS,
	DEBUGGING_IMAGE_KEY,
	EMPTY,
	FAKE_EMPTY,
	IDLE_VSCODE_IMAGE_KEY,
	IDLE_VSCODE_INSIDERS_IMAGE_KEY,
	REPLACE_KEYS,
	VSCODE_IMAGE_KEY,
	VSCODE_INSIDERS_IMAGE_KEY
} from './constants';
import { resolveFileIcon, toLower, toTitle, toUpper } from './utils';
import { sep } from 'path';
import { dataClass } from './data';
import isObject from 'lodash/isObject';

let isViewing = false;
let totalProblems = 0;

function isExcluded(config: string[], toMatch?: string) {
	if (!config || !toMatch) {
		return false;
	}

	if (!config.length) {
		return false;
	}

	const ignorePattern = config.join('|');
	const regex = new RegExp(ignorePattern, 'gm');
	const excluded = regex.test(toMatch);
	return excluded;
}

export function toggleViewing(viewing: boolean) {
	isViewing = viewing;
}

export function onDiagnosticsChange() {
	const diagnostics = languages.getDiagnostics();

	let counted = 0;

	diagnostics.forEach((diagnostic) => {
		if (diagnostic[1]) {
			diagnostic[1].forEach((diagnostic) => {
				if (diagnostic.severity === DiagnosticSeverity.Warning || diagnostic.severity === DiagnosticSeverity.Error) {
					counted++;
				}
			});
		}
	});

	totalProblems = counted;
}

export function activity(previous: Presence = {}): Presence {
	const config = getConfig();
	const { appName } = env;

	const insiders = appName.includes('Insiders');

	const defaultSmallImageKey = debug.activeDebugSession ? DEBUGGING_IMAGE_KEY : insiders ? VSCODE_INSIDERS_IMAGE_KEY : VSCODE_IMAGE_KEY;
	const defaultSmallImageText = config[CONFIG_KEYS.SmallImage].replace(REPLACE_KEYS.AppName, appName);
	const defaultLargeImageText = config[CONFIG_KEYS.LargeImageIdling];

	const removeDetails = config[CONFIG_KEYS.RemoveDetails];
	const removeLowerDetails = config[CONFIG_KEYS.RemoveLowerDetails];

	let presence: Presence = {
		details: removeDetails
			? undefined
			: details(CONFIG_KEYS.DetailsIdling, CONFIG_KEYS.DetailsViewing, CONFIG_KEYS.DetailsEditing, CONFIG_KEYS.DetailsDebugging),
		startTimestamp: config[CONFIG_KEYS.RemoveElapsedTime] ? undefined : previous.startTimestamp ?? Date.now(),
		largeImageKey: insiders ? IDLE_VSCODE_IMAGE_KEY : IDLE_VSCODE_INSIDERS_IMAGE_KEY,
		largeImageText: defaultLargeImageText,
		smallImageKey: defaultSmallImageKey,
		smallImageText: defaultSmallImageText
	};

	if (window.activeTextEditor) {
		const largeImageKey = resolveFileIcon(window.activeTextEditor.document);
		const largeImageText = config[CONFIG_KEYS.LargeImage]
			.replace(REPLACE_KEYS.LanguageLowerCase, toLower(largeImageKey))
			.replace(REPLACE_KEYS.LanguageTitleCase, toTitle(largeImageKey))
			.replace(REPLACE_KEYS.LanguageUpperCase, toUpper(largeImageKey))
			.padEnd(2, FAKE_EMPTY);

		const isWorkspaceExcluded = isExcluded(config[CONFIG_KEYS.IgnoreWorkspaces], dataClass.workspaceFolder?.uri.fsPath);

		let workspaceExcludedText = null;

		if (isWorkspaceExcluded && dataClass.workspaceFolder && dataClass.workspaceFolder.name) {
			workspaceExcludedText = isObject(config[CONFIG_KEYS.IgnoreWorkspacesText])
				? // @ts-ignore Element implicitly has an 'any' type because index expression is not of type 'number'.
				  config[CONFIG_KEYS.IgnoreWorkspacesText][dataClass.workspaceFolder.name] ?? 'No workspace ignore text provided.'
				: (config[CONFIG_KEYS.IgnoreWorkspacesText] as string);
		}

		presence = {
			...presence,
			details: removeDetails
				? undefined
				: isWorkspaceExcluded
				? workspaceExcludedText
				: details(CONFIG_KEYS.DetailsIdling, CONFIG_KEYS.DetailsViewing, CONFIG_KEYS.DetailsEditing, CONFIG_KEYS.DetailsDebugging),
			state: removeLowerDetails
				? undefined
				: isWorkspaceExcluded
				? undefined
				: details(
						CONFIG_KEYS.LowerDetailsIdling,
						CONFIG_KEYS.LowerDetailsViewing,
						CONFIG_KEYS.LowerDetailsEditing,
						CONFIG_KEYS.LowerDetailsDebugging
				  ),
			largeImageKey,
			largeImageText
		};

		if (config[CONFIG_KEYS.ButtonEnabled]) {
			const gitRepo = dataClass.gitRemoteUrl?.toString('https').replace(/\.git$/, '');
			const gitOrg = dataClass.gitRemoteUrl?.organization ?? dataClass.gitRemoteUrl?.owner;

			const isRepositoryExcluded = isExcluded(config[CONFIG_KEYS.IgnoreRepositories], gitRepo);
			const isOrganizationExcluded = isExcluded(config[CONFIG_KEYS.IgnoreOrganizations], gitOrg);

			const isNotExcluded = !isRepositoryExcluded && !isWorkspaceExcluded && !isOrganizationExcluded;

			if (gitRepo && config[CONFIG_KEYS.ButtonActiveLabel] && isNotExcluded) {
				presence = {
					...presence,
					buttons: [
						{
							label: config[CONFIG_KEYS.ButtonActiveLabel],
							url: gitRepo
						}
					]
				};
			} else if (!gitRepo && config[CONFIG_KEYS.ButtonInactiveLabel] && config[CONFIG_KEYS.ButtonInactiveUrl]) {
				presence = {
					...presence,
					buttons: [
						{
							label: config[CONFIG_KEYS.ButtonInactiveLabel],
							url: config[CONFIG_KEYS.ButtonInactiveUrl]
						}
					]
				};
			}
		}
	}

	return presence;
}

function details(idling: CONFIG_KEYS, viewing: CONFIG_KEYS, editing: CONFIG_KEYS, debugging: CONFIG_KEYS) {
	const config = getConfig();

	let raw = (config[idling] as string).replace(REPLACE_KEYS.Empty, FAKE_EMPTY);

	if (window.activeTextEditor) {
		const noWorkspaceFound = config[CONFIG_KEYS.LowerDetailsNoWorkspaceFound].replace(REPLACE_KEYS.Empty, FAKE_EMPTY);

		const workspaceFolderName = dataClass.workspaceFolder?.name ?? noWorkspaceFound;
		const workspaceName = dataClass.workspace?.replace(REPLACE_KEYS.VSCodeWorkspace, EMPTY) ?? workspaceFolderName;
		const workspaceAndFolder = `${workspaceName}${workspaceFolderName === FAKE_EMPTY ? '' : ` - ${workspaceFolderName}`}`;

		const fileIcon = resolveFileIcon(window.activeTextEditor.document);

		const problems = config[CONFIG_KEYS.ShowProblems]
			? config[CONFIG_KEYS.ProblemsText].replace(REPLACE_KEYS.ProblemsCount, totalProblems.toString())
			: '';

		raw = config[debug.activeDebugSession ? debugging : isViewing ? viewing : editing] as string;

		if (dataClass.workspace) {
			const name = dataClass.workspace;
			const relativePath = workspace.asRelativePath(window.activeTextEditor.document.fileName).split(sep);

			relativePath.splice(-1, 1);
			raw = raw.replace(REPLACE_KEYS.FullDirName, `${name}${sep}${relativePath.join(sep)}`);
		}

		raw = fileDetails(raw, window.activeTextEditor.document, window.activeTextEditor.selection);

		raw = raw
			.replace(REPLACE_KEYS.FileName, dataClass.fileName ?? FAKE_EMPTY)
			.replace(REPLACE_KEYS.DirName, dataClass.dirName ?? FAKE_EMPTY)
			.replace(REPLACE_KEYS.Workspace, workspaceName)
			.replace(REPLACE_KEYS.WorkspaceFolder, workspaceFolderName)
			.replace(REPLACE_KEYS.WorkspaceAndFolder, workspaceAndFolder)
			.replace(REPLACE_KEYS.LanguageLowerCase, toLower(fileIcon))
			.replace(REPLACE_KEYS.LanguageTitleCase, toTitle(fileIcon))
			.replace(REPLACE_KEYS.LanguageUpperCase, toUpper(fileIcon))
			.replace(REPLACE_KEYS.Problems, problems)
			.replace(REPLACE_KEYS.GitRepo, dataClass.gitRemoteUrl?.name ?? dataClass.gitRepoName ?? FAKE_EMPTY)
			.replace(REPLACE_KEYS.GitBranch, dataClass.gitBranchName ?? FAKE_EMPTY);
	}

	return raw;
}

function fileDetails(_raw: string, document: TextDocument, selection: Selection) {
	let raw = _raw.slice();

	if (raw.includes(REPLACE_KEYS.TotalLines)) {
		raw = raw.replace(REPLACE_KEYS.TotalLines, document.lineCount.toLocaleString());
	}

	if (raw.includes(REPLACE_KEYS.CurrentLine)) {
		raw = raw.replace(REPLACE_KEYS.CurrentLine, (selection.active.line + 1).toLocaleString());
	}

	if (raw.includes(REPLACE_KEYS.CurrentColumn)) {
		raw = raw.replace(REPLACE_KEYS.CurrentColumn, (selection.active.character + 1).toLocaleString());
	}

	return raw;
}
