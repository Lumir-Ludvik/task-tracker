import {
	createContext,
	PropsWithChildren,
	useCallback,
	useContext,
	useEffect,
	useState
} from "react";
import { TableDataType, TablesType } from "../common/types";
import { useResetTable } from "../hooks/useResetTable";
import { useFileSystem } from "../hooks/useFileSystem";
import { uuidv4 } from "../common/utils";
import { clearTimeout } from "timers";
import { useLocation } from "react-router";

type TableContextType = {
	tables: TablesType | null;
	resetTable: (tableName: string) => Promise<void>;
	deleteTable: (tableName: string) => void;
	saveTable: (data: TableDataType, tableKey?: string | null) => Promise<void>;
	handleCheckBoxChange: (
		tableName: string,
		rowIndex: number,
		statusIndex: number,
		change: boolean
	) => void;
};

// TODO: bette type safety
const TableContext = createContext<TableContextType>({
	tables: []
} as unknown as TableContextType);

export const TableContextProvider = ({ children }: PropsWithChildren) => {
	const { writeToFileAsync, readFileAsync } = useFileSystem();
	const location = useLocation();
	//TODO: why do I have this hook?
	const { resetTable: reset } = useResetTable();

	const [localTables, setLocalTables] = useState<TablesType | null>(null);

	const getTablesFromFile = useCallback(async (): Promise<TablesType | null> => {
		const data = await readFileAsync();

		if (!data) {
			// TODO: toast
			console.warn("Cannot read tables. File is missing!");
			return null;
		}

		return JSON.parse(data);
	}, [readFileAsync]);

	// private:
	useEffect(
		function refreshOnLocationChange() {
			void (async () => {
				const tables = await getTablesFromFile();

				if (!tables) {
					return;
				}

				setLocalTables(tables);
			})();
		},
		[getTablesFromFile, location]
	);

	const updateState = useCallback(
		async (nextState: TablesType) => {
			const res = await writeToFileAsync(JSON.stringify(nextState));

			if (res) {
				setLocalTables(nextState);
			}

			return res;
		},
		[writeToFileAsync]
	);

	const updateTablesFile = useCallback(
		async (
			tableKey: string,
			data: TableDataType,
			resetAt: number | null = null,
			isNoLongerNew: boolean = false
		) => {
			const nextTables: TablesType | null = await getTablesFromFile();

			if (!nextTables) {
				console.error(`Cannot update TableContext state. Tables.txt is missing!`);
				alert(`Cannot update TableContext state. Tables.txt is missing!`);
				return;
			}

			nextTables[tableKey] = {
				...data,
				resetAt,
				isNewlyAdded: isNoLongerNew ? false : data.isNewlyAdded
			};

			const res = await updateState(nextTables);
			if (!res) {
				console.error(`Cannot update table with key: ${tableKey}. Writing to tables.txt failed!`);
				alert(`Cannot update table with key: ${tableKey}. Writing to tables.txt failed!`);
			}
		},
		[getTablesFromFile, updateState]
	);

	const handleTableResetAtRequestedTime = useCallback(
		async (now: Date) => {
			// empty state
			if (!localTables) {
				return;
			}

			// this is safer but really stupid
			// const tables = await getTablesFromFile();

			const tables = localTables;

			if (!tables) {
				console.error("Failed to reset table. Tables.txt is missing!");
				alert("Failed to reset table. Tables.txt is missing!");
				return;
			}

			for (const tableKey of Object.keys(tables)) {
				const table = tables[tableKey];
				// table never resets
				if (!table.resetAt || table.dayOfReset === "never") {
					continue;
				}

				const tableResetAt = new Date(table.resetAt);

				// newly created table
				if (
					table.isNewlyAdded &&
					tableResetAt.getDate() === now.getDate() &&
					tableResetAt.getMonth() === now.getMonth()
				) {
					continue;
				}

				const shouldResetToday =
					(tableResetAt.getDate() !== now.getDate() ||
						(tableResetAt.getDate() === now.getDate() &&
							tableResetAt.getMonth() != now.getMonth())) &&
					// "5" == 5
					(table.dayOfReset == now.getDay() || table.dayOfReset === "always");

				if (
					(shouldResetToday && tableResetAt.getHours() > table.timeOfReset.hour) ||
					(tableResetAt.getHours() === table.timeOfReset.hour &&
						tableResetAt.getMinutes() >= table.timeOfReset.minute)
				) {
					if (tables[tableKey].tableName === "Daily ") {
						console.log("UFO Reset!", tables[tableKey]);
						console.log("UFO Reset! time now", now);
						console.log("UFO Reset! time in table", tableResetAt);
						console.log("UFO Reset! shouldResetToday", shouldResetToday);
					}
					const clearedTable = reset(tables[tableKey]);
					await updateTablesFile(tableKey, clearedTable, now.getTime(), true);
				}
			}
		},
		[localTables, reset, updateTablesFile]
	);

	useEffect(() => {
		const now = new Date();
		const isWholeMinute = now.getSeconds() === 0 || now.getSeconds() === 59;

		let timeout: NodeJS.Timeout;
		let interval: NodeJS.Timeout;

		// first run at the start of the app
		void (async () => await handleTableResetAtRequestedTime(now))();

		if (!isWholeMinute) {
			const timeoutMs = (60 - now.getSeconds()) * 1000;

			timeout = setTimeout(() => {
				void (async () => await handleTableResetAtRequestedTime(now))();

				interval = setInterval(() => {
					void (async () => await handleTableResetAtRequestedTime(now))();
				}, 60_000);
			}, timeoutMs);
		} else {
			interval = setInterval(() => {
				void (async () => await handleTableResetAtRequestedTime(now))();
			}, 60_000);
		}

		return () => {
			clearTimeout(timeout);
			clearInterval(interval);
		};
	}, [handleTableResetAtRequestedTime]);

	// public:
	const resetTable = useCallback(
		async (tableKey: string) => {
			const tables = await getTablesFromFile();

			if (!tables) {
				console.error("Cannot reset table. Tables.txt is missing!");
				alert("Cannot reset table. Tables.txt is missing!");
				return;
			}

			const clearedTable = reset(tables[tableKey]);
			await updateTablesFile(tableKey, clearedTable, new Date().getTime());
		},
		[getTablesFromFile, reset, updateTablesFile]
	);

	const deleteTable = useCallback(
		async (tableKey: string) => {
			const tables = await getTablesFromFile();

			if (!tables) {
				console.error("Cannot delete table. Tables.txt is missing!");
				alert("Cannot delete table. Tables.txt is missing!");
				return;
			}

			const nextTables: TablesType = {};

			Object.keys(tables)
				.filter((key) => key !== tableKey)
				.map((key) => {
					nextTables[key] = tables[key];
				});

			const res = await updateState(nextTables);

			if (!res) {
				console.error("Cannot delete table. Writing to tables.txt failed!");
				alert("Cannot delete table. Writing to tables.txt failed!");
			}
		},
		[getTablesFromFile, updateState]
	);

	const saveTable = useCallback(
		async (data: TableDataType, tableKey: string | null = null) => {
			void (async () => {
				let nextTables = (await getTablesFromFile()) ?? {};

				if (tableKey) {
					nextTables[tableKey] = data;
				} else {
					const newKey = uuidv4();
					nextTables = { ...nextTables, [newKey]: data };
				}

				const res = await updateState(nextTables);
				if (!res) {
					// TODO: add error toast for user
					console.error("Failed to save table data! Please try again.");
					alert("Failed to save table data! Please try again.");
				}
			})();
		},
		[getTablesFromFile, updateState]
	);

	const handleCheckBoxChange = useCallback(
		async (tableKey: string, rowIndex: number, statusIndex: number, change: boolean) => {
			const tables = await getTablesFromFile();

			if (!tables) {
				alert("Cannot toggle checkbox because tables.txt is missing!");
				return;
			}

			if (!tables[tableKey]) {
				console.error(
					`Cannot update state of table with key ${tableKey} because no such table exists in TableContext`
				);
				return;
			}

			const nextState = { ...tables };
			nextState[tableKey].rows[rowIndex].statuses[statusIndex] = change;

			const res = await updateState(nextState);

			if (!res) {
				console.error(
					`Cannot toggle checkbox for table with key: ${tableKey}. Writing to tables.txt failed!`
				);
				alert(
					`Cannot toggle checkbox for table with key: ${tableKey}. Writing to tables.txt failed!`
				);
			}
		},
		[getTablesFromFile, updateState]
	);

	return (
		<TableContext.Provider
			value={{
				tables: localTables,
				resetTable,
				deleteTable,
				saveTable,
				handleCheckBoxChange
			}}
		>
			{children}
		</TableContext.Provider>
	);
};

export const useTableContext = () => {
	const context = useContext(TableContext);
	if (!context) {
		throw new Error("TableContext must be used within a Provider");
	}

	return context;
};
