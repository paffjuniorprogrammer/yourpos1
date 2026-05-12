import sys

filepath = 'src/pages/ProductsPage.tsx'
content = open(filepath, 'rb').read().decode('utf-8')

# Fix 1: Remove duplicate prevUnitPrice from the state block (line 123)
# This one was incorrectly added by the previous fix; the original at line 194 is the right one
OLD1 = '  const [showBarcodeSheet, setShowBarcodeSheet] = useState(false);\n  const [prevUnitPrice, setPrevUnitPrice] = useState<number>(0);\n  const [locationFilter'
NEW1 = '  const [showBarcodeSheet, setShowBarcodeSheet] = useState(false);\n  const [locationFilter'

if OLD1 not in content:
    print("ERROR: Could not find Fix 1 target.")
    idx = content.find('showBarcodeSheet')
    print("Context:", repr(content[idx:idx+200]))
    sys.exit(1)

content = content.replace(OLD1, NEW1, 1)
print("Fix 1 applied: removed duplicate prevUnitPrice.")

# Fix 2: Pass business?.id to createCategory
OLD2 = '      const category = await createCategory(categoryName);\n'
NEW2 = '      if (!business?.id) { showToast("error", "Business context not found."); return; }\n      const category = await createCategory(categoryName, business.id);\n'

if OLD2 not in content:
    print("ERROR: Could not find Fix 2 target.")
    idx = content.find('createCategory(categoryName')
    print("Context:", repr(content[idx:idx+100]))
    sys.exit(1)

content = content.replace(OLD2, NEW2, 1)
print("Fix 2 applied: added business.id to createCategory.")

open(filepath, 'wb').write(content.encode('utf-8'))
print("SUCCESS: All fixes applied.")
