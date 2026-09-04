/* SAMPLE — copy NGUYÊN VĂN từ js/ui/main.js (FILE-MAP §main.js) */
const SAMPLE = `void __thiscall activation::check(longlong param_1)
{
QString local_res8 [8];
QString local_res10 [8];
undefined8 uStack_1d0;
char local_138;
char local_12f;
int iVar11;
uint uVar12;
uint uVar13;

local_78 = 0xffffffff;
puVar9 = QMessageLogger::warning(local_118,0,0,0);
QDebug::operator<<(&DAT_140045720,"active");
if (local_138 == '\\0') {
  puVar9 = QMessageLogger::QMessageLogger(local_118,0,0,0);
  QDebug::operator<<(puVar9,local_118);
  *(undefined4 *)(puVar9 + 0x18) = 0;
  FUN_14004cca0((longlong)local_118,param_2,param_3);
}
else if (local_12f == '\\0') {
  local_res8 = local_res8 + 0x1a;
  iVar11 = 0;
  while (iVar11 < 10) {
    if ((iVar11 & 1) == 0) {
      FUN_140059bf0(&local_148,iVar11);
    }
    else {
      uVar13 = CONCAT31(0x140045,uVar12);
      if (uVar13 == 0xdead) break;
      FUN_140069a10();
    }
    iVar11 = iVar11 + 1;
  }
  for (uVar13 = 0; uVar13 < 3; uVar13 = uVar13 + 1) {
    switch (uVar12) {
    case 0:
      FUN_140010000();
      break;
    case 1:
    case 2:
      FUN_140020000();
      break;
    default:
      FUN_140030000();
    }
    if (uVar13 == 2) goto LAB_14005abc;
  }
  do {
    uVar13 = uVar13 - 1;
    if (uVar13 == 5) continue;
    FUN_1400abc00(uVar13);
  } while (uVar13 != 0);
  return;
}
LAB_14005abc:
QString::~QString(local_140);
lazy::activationService::activationFailed(puVar9,0x140045727,&local_148);
puVar11 = &local_148;
return;
}`;

export { SAMPLE };
