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

   <xsl:output method="xml" indent="no" encoding="UTF-8" omit-xml-declaration="yes"/>
   
   <xsl:param name="viewMode" select="'diplomatic'" />
   <xsl:param name="inTextMode" select="true()" />

   <xsl:include href="p5-transcription-body.xsl"/>

   <xsl:variable name="is_casebooks" select="exists(//tei:publisher[matches(.,'Casebooks Project')])"/>
   
   <xsl:variable name="transcriber">
      <xsl:value-of select="//*:transcriber[1]"/>
   </xsl:variable>
   
   <xsl:variable name="requested_pb" select="(//*:text/*:body//*:pb)[1]"/>


   <xsl:template match="/">

      <xsl:element name="html">
         <xsl:element name="head">
            <xsl:element name="title">
                <xsl:value-of select="concat('Folio ', //*:text/*:body//*:pb/@n)"/>
            </xsl:element>
            <xsl:if test="not($is_casebooks)">
               <xsl:element name="style">
               <xsl:attribute name="type">text/css</xsl:attribute>
                  <xsl:text>
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
                  </xsl:text>
            </xsl:element></xsl:if>
            <link href="/stylesheets/texts.css" rel="stylesheet"/>
         </xsl:element>

         <xsl:element name="body">
            <xsl:if test="not($is_casebooks)">
               <xsl:attribute name="style" select="'font-family: CharisSIL;'"/>
            </xsl:if>
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
               <p class="pagenum">
                  <xsl:text>&lt;</xsl:text>
                  <xsl:value-of select="$requested_pb/@n"/>
                  <xsl:text>&gt;</xsl:text>
               </p>
            </xsl:otherwise>
         </xsl:choose>
      </xsl:element>
   </xsl:template>

   <xsl:template name="make-body">
      <xsl:call-template name="apply-mode-to-templates">
         <xsl:with-param name="displayMode" select="$viewMode"/>
         <xsl:with-param name="node" select="//tei:text/tei:body"/>
      </xsl:call-template>
   </xsl:template>
   
   <xsl:template name="make-footer">
      <div>
         <xsl:attribute name="class" select="'footer'" />
      </div>
   </xsl:template>

   <xsl:template match="tei:ref[not(@type)]" mode="diplomatic normalised">
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
   
   <xsl:template match="tei:text//tei:date|
                        tei:text//tei:name|
                        tei:text//tei:att|
                        tei:text//tei:roleName|
                        tei:text//tei:w|
                        tei:text//tei:desc|
                        tei:text//tei:locus" mode="#all">
      <xsl:apply-templates mode="#current"/>
   </xsl:template>
   
   <xsl:template match="tei:g" mode="#all">
      <xsl:choose>
         <xsl:when test=".='%'">
            <xsl:text>&#x25CE;</xsl:text>
         </xsl:when>
         <xsl:when test=".='@'">
            <xsl:text>&#x2748;</xsl:text>
         </xsl:when>
         <xsl:when test=".='$'">
            <xsl:text>&#x2240;</xsl:text>
         </xsl:when>
         <xsl:when test=".='bhale'">
            <xsl:text>&#x2114;</xsl:text>
         </xsl:when>
         <xsl:when test=".='ba'">
            <xsl:text>&#x00A7;</xsl:text>
         </xsl:when>
         <xsl:when test=".='&#x00A7;'">
            <xsl:text>&#x30FB;</xsl:text>
         </xsl:when>
         <xsl:otherwise>
            <i>
               <xsl:apply-templates mode="#current" />
            </i>
         </xsl:otherwise>
      </xsl:choose>
      
   </xsl:template>
   
   <!-- This might conflict with casebooks -->
   <xsl:template match="tei:graphic[not(@url)]" mode="#all">
      <xsl:if test="normalize-space(.)">
         <span class="graphic">
            <xsl:apply-templates mode="#current" />
         </span>
      </xsl:if>
   </xsl:template>
   
   <xsl:template match="tei:text//tei:title|
                         tei:text//tei:term" mode="#all">
      <i>
         <xsl:apply-templates mode="#current" />
      </i>
   </xsl:template>
   
   <!-- This old code for cb is a kludge to get small pseudo-tables to
       align a little better in MS-RGO-00014, 00005-00008
       It could probably be changed either to <space/> or if it were simple the entire
       construct could be changed to tables in the original
       By checking for the absence of elements, this template should ONLY fire
       for those deprecated uses.
-  -->
   <xsl:template match="tei:cb[not(@*)]" mode="#all">
      <span>
         <xsl:text disable-output-escaping="yes">&#160;&#160;&#160;&#160;&#160;</xsl:text>
         <xsl:apply-templates mode="#current" />
      </span>
   </xsl:template>
   
   <xsl:template match="tei:figure[not(*)]" mode="#all"/>
   
   
   <xsl:template match="//*:transcriber|//*:publisher" mode="#all"/>

</xsl:stylesheet>
