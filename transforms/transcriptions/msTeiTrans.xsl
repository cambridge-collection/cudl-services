<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0"
   xmlns:date="http://exslt.org/dates-and-times"
   xmlns:parse="http://cdlib.org/xtf/parse"
   xmlns:xtf="http://cdlib.org/xtf"
   xmlns:tei="http://www.tei-c.org/ns/1.0"
   xmlns:cudl="http://cudl.cam.ac.uk/xtf/"
   xmlns:xs="http://www.w3.org/2001/XMLSchema"
   xmlns="http://www.w3.org/1999/xhtml"
   extension-element-prefixes="date"
   exclude-result-prefixes="#all">

   <xsl:output method="xml" indent="no" encoding="UTF-8" omit-xml-declaration="yes"/>
   
   <xsl:param name="viewMode" select="'diplomatic'" />
   <xsl:param name="inTextMode" select="true()" />

   <xsl:include href="p5-transcription-body.xsl"/>
   <xsl:include href="project-specific/cudl-legacy.xsl"/>
   <xsl:include href="project-specific/newton.xsl"/>
   <xsl:include href="project-specific/casebooks.xsl"/>
   <xsl:include href="p5-textual-notes.xsl"/>
   
   <xsl:variable name="project_name" select="cudl:determine-project(/*)" as="xs:string"/>
   <xsl:variable name="use_legacy_display" select="cudl:use-legacy-character-and-font-processing($project_name)" as="xs:boolean"/>
   <xsl:variable name="use_early-modern_fonts" select="cudl:use-early-modern-fonts($project_name)" as="xs:boolean"/>
   
   <xsl:variable name="transcriber">
      <xsl:value-of select="//*:transcriber[1]"/>
   </xsl:variable>
   
   <xsl:variable name="requested_pb" select="(//*:text/*:body//*:pb)[1]"/>


   <xsl:template match="/">
      <html>
         <head>
            <title>
                <xsl:value-of select="concat('Folio ', $requested_pb/@n)"/>
            </title>
            <xsl:call-template name="cudlLegacyCSS"/>
            <link href="/stylesheets/texts.css" rel="stylesheet"/>
         </head>

         <body>
            <xsl:if test="$use_legacy_display eq true()">
               <xsl:attribute name="style" select="'font-family: CharisSIL;'"/>
            </xsl:if>
            <xsl:call-template name="make-header" />
            <xsl:call-template name="make-body" />
            <xsl:call-template name="make-footer" />
         </body>

      </html>

   </xsl:template>
   

   <xsl:template name="make-header">

      <div class="header">
         <xsl:choose>
            <xsl:when test="$transcriber='Corpus Coranicum'">
               <p style="text-align: right">
                  <xsl:text>Transcription by </xsl:text>
                  <a href="http://www.corpuscoranicum.de/" target="_blank">
                     <xsl:text>Corpus Coranicum</xsl:text>
                  </a>
               </p>
            </xsl:when>
            <xsl:otherwise>
               <p class="pagenum">
                  <xsl:text>&lt;</xsl:text>
                  <xsl:value-of select="$requested_pb/@n"/>
                  <xsl:text>&gt;</xsl:text>
               </p>
            </xsl:otherwise>
         </xsl:choose>
      </div>
   </xsl:template>

   <xsl:template name="make-body">
      <xsl:call-template name="apply-mode-to-templates">
         <xsl:with-param name="displayMode" select="$viewMode"/>
         <xsl:with-param name="node" select="//tei:text/tei:body"/>
      </xsl:call-template>
   </xsl:template>
   
   <xsl:template name="make-footer">
      <div class="footer"/>
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
                        tei:text//tei:persName|
                        tei:text//tei:orgName|
                        tei:text//tei:att|
                        tei:text//tei:roleName|
                        tei:text//tei:w|
                        tei:text//tei:desc|
                        tei:text//tei:locus" mode="#all">
      <xsl:apply-templates mode="#current"/>
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
      
   <xsl:template match="tei:figure[not(*)]" mode="#all"/>
   
   
   <xsl:template match="//*:transcriber|//*:publisher" mode="#all"/>

</xsl:stylesheet>
