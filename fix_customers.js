const fs = require('fs');
let content = fs.readFileSync('src/pages/CustomersPage.tsx', 'utf8');
const lines = content.split('\n');

const newBlock = [
  '                      <td className="border-b border-slate-100 px-5 py-4">',
  '                        <div className="flex flex-wrap items-center gap-2">',
  '                          {can("Customers", "edit") && (',
  '                            <button',
  '                              onClick={() => openEditModal(row)}',
  '                              className="rounded-xl bg-sky-50 p-2 text-sky-600 transition hover:bg-sky-100"',
  '                              title="Edit Customer"',
  '                            >',
  '                              <Pencil size={16} />',
  '                            </button>',
  '                          )}',
  '                          {can("Customers", "delete") && (',
  '                            <button',
  '                              onClick={() => deleteCustomer(row.id)}',
  '                              className="rounded-xl bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100"',
  '                              title="Delete Customer"',
  '                            >',
  '                              <Trash2 size={16} />',
  '                            </button>',
  '                          )}',
  '                          <button',
  '                            onClick={() => handlePrintCustomer(row)}',
  '                            className="rounded-xl bg-orange-50 p-2 text-orange-600 transition hover:bg-orange-100"',
  '                            title="Print Statement"',
  '                          >',
  '                            <Printer size={16} />',
  '                          </button>',
  '                        </div>',
  '                      </td>',
  '                    </tr>',
];

// Replace lines index 331-359 (29 lines) with newBlock (31 lines)
lines.splice(331, 29, ...newBlock);
fs.writeFileSync('src/pages/CustomersPage.tsx', lines.join('\n'), 'utf8');
console.log('Done!');
const result = fs.readFileSync('src/pages/CustomersPage.tsx', 'utf8').split('\n');
result.slice(330, 363).forEach((l, i) => console.log((331+i) + ': ' + l));
