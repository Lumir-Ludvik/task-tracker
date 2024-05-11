import { TableDataType } from "../../common/types";
import { TableForm } from "./types";

export const mapFormDataToTableDataType = (form: TableForm): TableDataType => ({
	...form,
	rows: form.rows
		.filter((column) => column.value !== "")
		.map((row) => ({
			...row,
			availableFor: row.availableFor
				.split(",")
				.filter((parsedAvailable) => parsedAvailable)
				.map((filteredAvailable) => Number(filteredAvailable)),
			name: row.value,
			statuses: new Array(form.columns.filter((column) => column.value !== "").length).fill(false),
			color: row.color
		})),
	columns: form.columns
		.filter((column) => column.value !== "")
		.map((column) => ({
			...column,
			name: column.value,
			color: column.color
		}))
});

export const mapTableDataTypeToFormData = (tableData: TableDataType): TableForm => ({
	...tableData,
	tableName: tableData.tableName,
	timeOfReset: tableData.timeOfReset,
	columns: tableData.columns.map((column) => ({
		value: column.name,
		color: column.color
	})),
	rows: tableData.rows.map((row) => ({
		value: row.name,
		color: row.color,
		availableFor: row.availableFor.join(",")
	}))
});
