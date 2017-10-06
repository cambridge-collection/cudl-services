<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0"
   xmlns:date="http://exslt.org/dates-and-times"
   xmlns:parse="http://cdlib.org/xtf/parse"
   xmlns:xtf="http://cdlib.org/xtf"
   xmlns:tei="http://www.tei-c.org/ns/1.0"
   xmlns:cudl="http://cudl.cam.ac.uk/xtf/"
   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
   xmlns="http://www.w3.org/1999/xhtml"
   extension-element-prefixes="date"
   exclude-result-prefixes="#all">

   <xsl:output method="xml" indent="yes" encoding="UTF-8"/>
   
   <xsl:param name="viewMode" select="'diplomatic'" />
   <xsl:param name="inTextMode" select="true()" />
   
   <xsl:include href="p5-transcription-body.xsl"/>

   <xsl:variable name="transcriber">
      <xsl:value-of select="//*:transcriber[1]"/>
   </xsl:variable>


   <xsl:template match="/">

      <xsl:element name="html">
         <xsl:element name="head">
            <xsl:element name="title">
                <xsl:value-of select="concat('Folio ', //*:text/*:body//*:pb/@n)"/>
            </xsl:element>
            <xsl:element name="style">
               <xsl:attribute name="type">text/css</xsl:attribute>
               @font-face
               {
               font-family: CharisSIL;
               font-weight: normal;
               src: url('http://cudl.lib.cam.ac.uk/styles/fonts/CharisSIL-R.ttf'),
               url('http://cudl.lib.cam.ac.uk/styles/fonts/CharisSIL-R.eot'); /* IE9 */
               }
               @font-face
               {
               font-family: CharisSIL;
               font-weight: bold;
               src: url('http://cudl.lib.cam.ac.uk/styles/fonts/CharisSIL-B.ttf'),
               url('/styles/fonts/CharisSIL-B.eot'); /* IE9 */
               }
               @font-face
               {
               font-family: CharisSIL;
               font-style: italic
               src: url('http://cudl.lib.cam.ac.uk/styles/fonts/CharisSIL-I.ttf'),
               url('http://cudl.lib.cam.ac.uk/styles/fonts/CharisSIL-I.eot'); /* IE9 */
               }
               @font-face
               {
               font-family: CharisSIL;
               font-weight: bold;
               font-style: italic;
               src: url('/styles/fonts/CharisSIL-BI.ttf'),
               url('http://cudl.lib.cam.ac.uk/styles/fonts/CharisSIL-BI.eot'); /* IE9 */
               }
            </xsl:element>
         </xsl:element>

         <xsl:element name="body">
            <xsl:attribute name="style" select="'font-family: CharisSIL;'"/>
            <xsl:attribute name="class" select="/*:facetCollection"/>
            <xsl:call-template name="make-header" />
            <xsl:call-template name="make-body" />
            <xsl:call-template name="make-footer" />
         </xsl:element>

      </xsl:element>

   </xsl:template>

   <xsl:template name="make-header">

      <xsl:element name="div">
         <xsl:attribute name="class" select="'header'" />

         <xsl:choose>
            <xsl:when test="$transcriber='Corpus Coranicum'">
               <xsl:element name="p">
                  <xsl:attribute name="style" select="'text-align: right'"/>
                  <xsl:text>Transcription by </xsl:text>
                  <xsl:element name="a">
                     <xsl:attribute name="href">http://www.corpuscoranicum.de/</xsl:attribute>
                     <xsl:attribute name="target">_blank</xsl:attribute>
                     <xsl:text>Corpus Coranicum</xsl:text>
                  </xsl:element>
               </xsl:element>
            </xsl:when>
            <xsl:otherwise>
               <xsl:element name="p">
                  <xsl:attribute name="style" select="'color: #3D3D8F'"/>
                  <xsl:value-of select="concat('&lt;', //*:text/*:body//*:pb/@n, '&gt;')"/>
               </xsl:element>
            </xsl:otherwise>
         </xsl:choose>
      </xsl:element>
   </xsl:template>

   <xsl:template name="make-body">
      <xsl:call-template name="apply-mode-to-templates">
         <xsl:with-param name="displayMode" select="//tei:text/tei:body"/>
         <xsl:with-param name="node" select="."/>
      </xsl:call-template>
   </xsl:template>

   <xsl:template match="*:term" mode="html">

      <xsl:element name="i">
         <xsl:apply-templates mode="html" />
      </xsl:element>

   </xsl:template>

   <xsl:template match="*:ref[@type='biblio']" mode="html">

      <xsl:apply-templates mode="html" />

   </xsl:template>

   <xsl:template match="*:ref[@type='extant_mss']" mode="html">

      <xsl:choose>
         <xsl:when test="normalize-space(@target)">
            <xsl:element name="a">
               <xsl:attribute name="target" select="'_blank'"/>
               <xsl:attribute name="class" select="'externalLink'"/>
               <xsl:attribute name="href" select="normalize-space(@target)"/>
               <xsl:apply-templates mode="html" />
            </xsl:element>
         </xsl:when>
         <xsl:otherwise>
            <xsl:apply-templates mode="html" />
         </xsl:otherwise>
      </xsl:choose>

   </xsl:template>

   <xsl:template match="*:ref[not(@type)]" mode="diplomatic normalised">

      <xsl:choose>
         <xsl:when test="normalize-space(@target)">
            <xsl:element name="a">
               <xsl:attribute name="target" select="'_blank'"/>
               <xsl:attribute name="class" select="'externalLink'"/>
               <xsl:attribute name="href" select="normalize-space(@target)"/>
               <xsl:apply-templates mode="#current" />
            </xsl:element>
         </xsl:when>
         <xsl:otherwise>
            <xsl:apply-templates mode="#current" />
         </xsl:otherwise>
      </xsl:choose>
   </xsl:template>

   <xsl:template match="*:graphic[not(@url)]" mode="html">

      <xsl:if test="normalize-space(.)">
         <xsl:element name="span">
            <xsl:attribute name="class" select="'graphic'" />
            <xsl:attribute name="style" select="'font-style:italic;'" />
            <xsl:apply-templates mode="html" />
         </xsl:element>
      </xsl:if>

   </xsl:template>

   <xsl:template match="*:desc" mode="html">

      <xsl:apply-templates mode="html" />

   </xsl:template>

   <xsl:template name="make-footer">

      <xsl:element name="div">
         <xsl:attribute name="class" select="'footer'" />
      </xsl:element>


   </xsl:template>

</xsl:stylesheet>
