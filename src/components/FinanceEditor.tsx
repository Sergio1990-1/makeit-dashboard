import { useState } from "react";
import type { ProjectData } from "../types";
import { updateProjectFinance } from "../utils/config";

interface Props {
  projects: ProjectData[];
  onSave: () => void;
  onClose: () => void;
}

export function FinanceEditor({ projects, onSave, onClose }: Props) {
  const [values, setValues] = useState(
    projects.map((p) => ({ repo: p.repo, client: p.client, budget: p.budget, paid: p.paid }))
  );

  const update = (i: number, field: "budget" | "paid", val: string) => {
    const num = parseFloat(val) || 0;
    setValues((prev) => prev.map((v, idx) => (idx === i ? { ...v, [field]: num } : v)));
  };

  const handleSave = () => {
    for (const v of values) {
      updateProjectFinance(v.repo, v.budget, v.paid);
    }
    onSave();
  };

  const total = values.reduce((s, v) => s + v.budget, 0);
  const totalPaid = values.reduce((s, v) => s + v.paid, 0);

  return (
    <div className="finance-overlay" onClick={onClose}>
      <div className="finance-modal" onClick={(e) => e.stopPropagation()}>
        <div className="finance-header">
          <h2>Финансы проектов</h2>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>

        <table className="finance-table">
          <thead>
            <tr>
              <th>Проект</th>
              <th>Клиент</th>
              <th>Бюджет ($)</th>
              <th>Оплачено ($)</th>
              <th>Остаток</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={v.repo}>
                <td className="finance-repo">{v.repo}</td>
                <td className="finance-client">{v.client}</td>
                <td>
                  <input
                    type="number"
                    value={v.budget || ""}
                    onChange={(e) => update(i, "budget", e.target.value)}
                    className="finance-input"
                    placeholder="0"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={v.paid || ""}
                    onChange={(e) => update(i, "paid", e.target.value)}
                    className="finance-input"
                    placeholder="0"
                  />
                </td>
                <td className={`finance-remaining ${v.budget - v.paid > 0 ? "positive" : ""}`}>
                  ${(v.budget - v.paid).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}><strong>Итого</strong></td>
              <td><strong>${total.toLocaleString()}</strong></td>
              <td><strong>${totalPaid.toLocaleString()}</strong></td>
              <td className={`finance-remaining ${total - totalPaid > 0 ? "positive" : ""}`}>
                <strong>${(total - totalPaid).toLocaleString()}</strong>
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="finance-actions">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleSave}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
