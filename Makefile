BEEBASM:=beebasm
DISKCONV:=python disk_conv.py
TMP:=./tmp
MKDIR:=mkdir -p
CAT:=cat
SHA1:=openssl dgst -sha1

.PHONY:build_exile
build_exile:
	$(MKDIR) $(TMP)

	$(BEEBASM) -i exileb.6502 -do $(TMP)/exileb.ssd
	$(DISKCONV) --not-emacs $(TMP)/exileb.ssd
	cd $(TMP)/exileb/0 && $(CAT) BMAIN BINTRO > ../../exileb.new

	$(BEEBASM) -i exilemc.6502 -do $(TMP)/exilemc.ssd
	$(DISKCONV) --not-emacs $(TMP)/exilemc.ssd
	cd $(TMP)/exilemc/0 && $(CAT) SRAM SROM SINIT2 SINIT > ../../exilemc.new

	$(SHA1) $(TMP)/exileb.new
	$(SHA1) $(TMP)/exilemc.new
