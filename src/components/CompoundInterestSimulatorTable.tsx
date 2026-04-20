import * as styles from "./CompoundInterestSimulator.module.css";

const CURRENCY_FORMATTER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export interface CompoundInterestTableRow {
  period: string;
  value: number;
  invested: number;
  interest: number;
  grossInterest: number;
  fees: number;
  tax: number;
  periodIndex: number;
}

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(Math.round(value));
}

function formatTableCurrencyValue(
  value: number,
  options: {
    signed?: boolean;
    zeroAsDash?: boolean;
  } = {},
): string {
  const rounded = Math.round(value);
  const zeroAsDash = options.zeroAsDash ?? true;
  if (zeroAsDash && rounded === 0) return "—";

  const absoluteValue = `${formatCurrency(Math.abs(value))} €`;
  if (options.signed) {
    if (rounded > 0) return `+${absoluteValue}`;
    if (rounded < 0) return `-${absoluteValue}`;
    return "0 €";
  }

  return rounded < 0 ? `-${absoluteValue}` : absoluteValue;
}

function getTableDeltaClassName(value: number): string {
  if (value > 0) return styles.tableValuePositive;
  if (value < 0) return styles.tableValueNegative;
  return styles.tableValueMuted;
}

interface CompoundInterestTableProps {
  rows: CompoundInterestTableRow[];
}

export function CompoundInterestTable({ rows }: CompoundInterestTableProps) {
  return (
    <div className={styles.tablePanel}>
      <div className={styles.tableWrapper}>
        <table className={`${styles.tableElement} ${styles.tableElementDetailed}`}>
          <thead>
            <tr>
              <th className={`${styles.tableHeadCell} ${styles.tableHeadCellPeriod}`}>Période</th>
              <th className={`${styles.tableHeadCell} ${styles.tableHeadCellNumeric} ${styles.tableHeadCellSecondary}`}>
                Capital investi
              </th>
              <th className={`${styles.tableHeadCell} ${styles.tableHeadCellNumeric}`}>Capital final</th>
              <th className={`${styles.tableHeadCell} ${styles.tableHeadCellNumeric}`}>Gains nets</th>
              <th className={`${styles.tableHeadCell} ${styles.tableHeadCellNumeric} ${styles.tableHeadCellSecondary}`}>
                Intérêts bruts
              </th>
              <th className={`${styles.tableHeadCell} ${styles.tableHeadCellNumeric} ${styles.tableHeadCellSecondary}`}>
                Frais cumulés
              </th>
              <th className={`${styles.tableHeadCell} ${styles.tableHeadCellNumeric} ${styles.tableHeadCellSecondary}`}>
                Impôts cumulés
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const netGain = row.value - row.invested;
              return (
                <tr key={`${row.period}-${row.periodIndex}`}>
                  <td className={`${styles.tableCell} ${styles.tableCellPeriod}`}>{row.period}</td>
                  <td className={`${styles.tableCell} ${styles.tableCellNumeric} ${styles.tableCellSecondary}`}>
                    {formatTableCurrencyValue(row.invested, { zeroAsDash: false })}
                  </td>
                  <td className={`${styles.tableCell} ${styles.tableCellNumeric}`}>
                    {formatTableCurrencyValue(row.value, { zeroAsDash: false })}
                  </td>
                  <td className={`${styles.tableCell} ${styles.tableCellNumeric} ${getTableDeltaClassName(netGain)}`}>
                    {formatTableCurrencyValue(netGain, { signed: true })}
                  </td>
                  <td className={`${styles.tableCell} ${styles.tableCellNumeric} ${styles.tableCellSecondary}`}>
                    {formatTableCurrencyValue(row.grossInterest)}
                  </td>
                  <td className={`${styles.tableCell} ${styles.tableCellNumeric} ${styles.tableCellSecondary}`}>
                    {formatTableCurrencyValue(-row.fees)}
                  </td>
                  <td className={`${styles.tableCell} ${styles.tableCellNumeric} ${styles.tableCellSecondary}`}>
                    {formatTableCurrencyValue(-row.tax)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
