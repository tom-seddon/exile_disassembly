BEEBASM:=beebasm
DISKCONV:=python disk_conv.py
DUMP:=python dump.py
TMP:=./tmp
MKDIR:=mkdir -p
CAT:=cat
SHA1:=openssl dgst -sha1
DIFF:=diff --suppress-common-lines

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
ifneq ($(wildcard exileb.orig),)
	$(SHA1) exileb.orig
	$(DUMP) $(TMP)/exileb.new > $(TMP)/exileb.new.txt
	$(DUMP) exileb.orig > $(TMP)/exileb.orig.txt
	$(DIFF) $(TMP)/exileb.orig.txt $(TMP)/exileb.new.txt
endif

	$(SHA1) $(TMP)/exilemc.new
ifneq ($(wildcard exilemc.orig),)
	$(SHA1) exilemc.orig
	$(DUMP) $(TMP)/exilemc.new > $(TMP)/exilemc.new.txt
	$(DUMP) exilemc.orig > $(TMP)/exilemc.orig.txt
	$(DIFF) $(TMP)/exilemc.orig.txt $(TMP)/exilemc.new.txt
endif
